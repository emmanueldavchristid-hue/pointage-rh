import { Router, type Request } from 'express';
import { z } from 'zod';
import { and, desc, eq, gte, lte, sql, inArray, isNull, asc } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import type { Tx } from '../db/index.js';
import { ah, parse, zDate, zId, zReason, pageParams } from '../utils/http.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';
import { requireRole, ADMINS, STAFF, departmentScope, assertCanAccessEmployee } from '../middlewares/auth.js';
import { audit } from '../services/audit.js';
import { fileUrl, empBrief } from '../services/dto.js';
import { lockAttendance, recomputeAttendance, raiseAnomaly } from '../services/attendance.js';
import { loadScheduleResolver, resolveSchedule, toRules } from '../services/schedule.js';
import { loadHolidays, loadApprovedLeaves } from '../services/dayContext.js';
import { companyTz } from '../services/settings.js';
import { notifyEmployee } from '../services/notify.js';
import { localDate, fmtTime } from '../utils/time.js';
import { isScheduledWorkDay } from '../services/calc.js';

export const router = Router();

export function attendanceSelect() {
  return db.select({ a: schema.attendances, ...empBrief }).from(schema.attendances)
    .innerJoin(schema.employees, eq(schema.employees.id, schema.attendances.employeeId))
    .leftJoin(schema.departments, eq(schema.departments.id, schema.employees.departmentId));
}
export function attendanceDto(r: any) {
  const a = r.a;
  return {
    id: a.id, employeeId: a.employeeId, employee: { fullName: r.fullName, matricule: r.matricule, departmentName: r.departmentName ?? null, photoUrl: fileUrl(r.photoPath) },
    workDate: a.workDate, state: a.state, dayStatus: a.dayStatus, arrivalAt: a.arrivalAt, departureAt: a.departureAt,
    expectedMinutes: a.expectedMinutes, lateRawMinutes: a.lateRawMinutes, lateMinutes: a.lateMinutes, earlyLeaveMinutes: a.earlyLeaveMinutes,
    presenceMinutes: a.presenceMinutes, breakMinutes: a.breakMinutes, workedMinutes: a.workedMinutes, normalMinutes: a.normalMinutes,
    overtimePotentialMinutes: a.overtimePotentialMinutes, breakCount: a.breakCount, corrected: a.corrected, isClosed: a.isClosed,
    dayStatusOverride: a.dayStatusOverride,
  };
}

/** Filtres communs (période, département, employé) + périmètre manager */
export function scopeConds(req: Request, q: { departmentId?: number; employeeId?: number }) {
  const conds: any[] = [];
  const scope = departmentScope(req);
  if (scope === 'NONE') conds.push(sql`false`);
  else if (scope) conds.push(eq(schema.employees.departmentId, scope));
  if (q.departmentId) conds.push(eq(schema.employees.departmentId, q.departmentId));
  if (q.employeeId) conds.push(eq(schema.employees.id, q.employeeId));
  return conds;
}

const listQ = z.object({ date: zDate.optional(), from: zDate.optional(), to: zDate.optional(), departmentId: zId.optional(), employeeId: zId.optional(),
  state: z.string().max(30).optional(), dayStatus: z.string().max(30).optional(), corrected: z.enum(['0', '1']).optional() }).passthrough();

router.get('/', requireRole(...STAFF), ah(async (req, res) => {
  const q = parse(listQ, req.query);
  const { page, pageSize, offset } = pageParams(req.query);
  const conds = scopeConds(req, q);
  if (q.date) conds.push(eq(schema.attendances.workDate, q.date));
  if (q.from) conds.push(gte(schema.attendances.workDate, q.from));
  if (q.to) conds.push(lte(schema.attendances.workDate, q.to));
  if (q.state) conds.push(inArray(schema.attendances.state, q.state.split(',') as any));
  if (q.dayStatus) conds.push(inArray(schema.attendances.dayStatus, q.dayStatus.split(',') as any));
  if (q.corrected === '1') conds.push(eq(schema.attendances.corrected, true));
  const where = conds.length ? and(...conds) : undefined;
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(schema.attendances)
    .innerJoin(schema.employees, eq(schema.employees.id, schema.attendances.employeeId)).where(where);
  const rows = await attendanceSelect().where(where).orderBy(desc(schema.attendances.workDate), asc(schema.employees.lastName)).limit(pageSize).offset(offset);
  res.json({ items: rows.map(attendanceDto), total, page, pageSize });
}));

/** Tableau de présence en temps réel pour une date */
router.get('/live', requireRole(...STAFF), ah(async (req, res) => {
  const q = parse(z.object({ date: zDate.optional(), departmentId: zId.optional() }), req.query);
  const tz = await companyTz();
  const date = q.date ?? localDate(new Date(), tz);
  res.json(await liveBoard(req, date, q.departmentId));
}));

export async function liveBoard(req: Request, date: string, departmentId?: number) {
  const tz = await companyTz();
  const empConds = [eq(schema.employees.status, 'ACTIVE'), ...scopeConds(req, { departmentId })];
  const emps = await db.select({ e: schema.employees, dep: schema.departments.name }).from(schema.employees)
    .leftJoin(schema.departments, eq(schema.departments.id, schema.employees.departmentId)).where(and(...empConds)).orderBy(schema.employees.lastName);
  const ids = emps.map((x) => x.e.id);
  const atts = ids.length ? await attendanceSelect().where(and(eq(schema.attendances.workDate, date), inArray(schema.attendances.employeeId, ids))) : [];
  const byEmp = new Map(atts.map((r) => [r.a.employeeId, r]));
  const resolve = await loadScheduleResolver();
  const holidays = await loadHolidays();
  const leaves = await loadApprovedLeaves(date, date, ids);
  const holiday = holidays.label(date);
  const now = new Date();
  const out = { date, holiday, present: [] as any[], notArrived: [] as any[], late: [] as any[], earlyLeave: [] as any[], incomplete: [] as any[], onBreak: [] as any[],
    onLeave: [] as any[], absent: [] as any[], departed: [] as any[], notScheduled: [] as any[] };
  for (const { e, dep } of emps) {
    if (e.hireDate ? e.hireDate > date : localDate(e.createdAt, tz) > date) continue;
    const brief = { employeeId: e.id, fullName: `${e.firstNames} ${e.lastName}`, matricule: e.matricule, departmentName: dep, photoUrl: fileUrl(e.photoPath) };
    const r = byEmp.get(e.id);
    const leave = leaves.get(e.id, date);
    const sched = resolve(e, date);
    const working = !!sched && isScheduledWorkDay(date, toRules(sched.version)) && !holiday;
    if (r) {
      const a = attendanceDto(r);
      if (a.arrivalAt) {
        out.present.push(a);
        if (a.lateMinutes > 0) out.late.push(a);
        if (a.earlyLeaveMinutes > 0) out.earlyLeave.push(a);
        if (a.state === 'EN_PAUSE') out.onBreak.push(a);
        if (a.departureAt) out.departed.push(a);
        if (a.state === 'POINTAGE_INCOMPLET') out.incomplete.push(a);
        continue;
      }
      if (a.dayStatus === 'ABSENCE_NON_JUSTIFIEE') { out.absent.push({ ...brief, attendanceId: a.id, dayStatus: a.dayStatus }); continue; }
    }
    if (leave) { out.onLeave.push({ ...brief, leave: leave.label, category: leave.category }); continue; }
    if (!working) { out.notScheduled.push({ ...brief, reason: holiday ? 'Jour férié' : sched ? 'Jour non travaillé' : 'Aucun horaire' }); continue; }
    const expected = sched ? `${sched.version.startTime}` : null;
    out.notArrived.push({ ...brief, expectedStart: expected });
  }
  const scheduled = out.present.length + out.notArrived.length + out.absent.length + out.onLeave.length;
  return { ...out, counts: {
    active: emps.length, scheduled, present: out.present.length, notArrived: out.notArrived.length, late: out.late.length, earlyLeave: out.earlyLeave.length,
    incomplete: out.incomplete.length, onBreak: out.onBreak.length, onLeave: out.onLeave.length, absent: out.absent.length, departed: out.departed.length,
  }, generatedAt: now, timezone: tz };
}

router.get('/events', requireRole(...STAFF), ah(async (req, res) => {
  const q = parse(z.object({ employeeId: zId.optional(), from: zDate.optional(), to: zDate.optional(), result: z.enum(['ACCEPTE', 'REFUSE']).optional() }).passthrough(), req.query);
  const { page, pageSize, offset } = pageParams(req.query);
  const conds = scopeConds(req, q);
  if (q.from) conds.push(gte(schema.attendanceEvents.workDate, q.from));
  if (q.to) conds.push(lte(schema.attendanceEvents.workDate, q.to));
  if (q.result) conds.push(eq(schema.attendanceEvents.result, q.result));
  const where = conds.length ? and(...conds) : undefined;
  const base = db.select({ ev: schema.attendanceEvents, ...empBrief, location: schema.locationQrCodes.label }).from(schema.attendanceEvents)
    .innerJoin(schema.employees, eq(schema.employees.id, schema.attendanceEvents.employeeId))
    .leftJoin(schema.departments, eq(schema.departments.id, schema.employees.departmentId))
    .leftJoin(schema.locationQrCodes, eq(schema.locationQrCodes.id, schema.attendanceEvents.locationQrId));
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(schema.attendanceEvents).innerJoin(schema.employees, eq(schema.employees.id, schema.attendanceEvents.employeeId)).where(where);
  const rows = await base.where(where).orderBy(desc(schema.attendanceEvents.serverTime)).limit(pageSize).offset(offset);
  res.json({ items: rows.map((r) => ({ ...r.ev, employee: { fullName: r.fullName, matricule: r.matricule, departmentName: r.departmentName }, location: r.location })), total, page, pageSize });
}));

router.get('/:id', requireRole(...STAFF), ah(async (req, res) => {
  const id = parse(zId, req.params.id);
  const [r] = await attendanceSelect().where(eq(schema.attendances.id, id));
  if (!r) throw notFound();
  await assertCanAccessEmployee(req, r.a.employeeId);
  const [events, breaks, corrections, anomalies, overtime, version] = await Promise.all([
    db.select({ ev: schema.attendanceEvents, location: schema.locationQrCodes.label }).from(schema.attendanceEvents)
      .leftJoin(schema.locationQrCodes, eq(schema.locationQrCodes.id, schema.attendanceEvents.locationQrId))
      .where(eq(schema.attendanceEvents.attendanceId, id)).orderBy(schema.attendanceEvents.serverTime),
    db.select().from(schema.attendanceBreaks).where(eq(schema.attendanceBreaks.attendanceId, id)).orderBy(schema.attendanceBreaks.startAt),
    db.select({ c: schema.attendanceCorrections, admin: schema.users.login }).from(schema.attendanceCorrections)
      .innerJoin(schema.users, eq(schema.users.id, schema.attendanceCorrections.adminUserId)).where(eq(schema.attendanceCorrections.attendanceId, id)).orderBy(schema.attendanceCorrections.createdAt),
    db.select().from(schema.anomalies).where(eq(schema.anomalies.attendanceId, id)),
    db.select().from(schema.overtimeRecords).where(eq(schema.overtimeRecords.attendanceId, id)),
    r.a.scheduleVersionId ? db.select().from(schema.scheduleVersions).where(eq(schema.scheduleVersions.id, r.a.scheduleVersionId)) : Promise.resolve([]),
  ]);
  res.json({ ...attendanceDto(r), events: events.map((e) => ({ ...e.ev, location: e.location })), breaks,
    corrections: corrections.map((c) => ({ ...c.c, adminLogin: c.admin })), anomalies, overtime: overtime[0] ?? null, scheduleVersion: version[0] ?? null });
}));

/* -------------------------------------------- corrections administratives */
const DAY_STATUSES = ['PRESENT', 'RETARD', 'ABSENCE_NON_JUSTIFIEE', 'ABSENCE_JUSTIFIEE', 'CONGE', 'PERMISSION', 'MISSION', 'FERIE', 'NON_TRAVAILLE', 'INCOMPLET'] as const;
const correctionInput = z.object({ arrivalAt: z.string().datetime({ offset: true }).nullable().optional(), departureAt: z.string().datetime({ offset: true }).nullable().optional(),
  dayStatus: z.enum(DAY_STATUSES).nullable().optional(), reason: zReason });

async function applyCorrection(req: Request, tx: Tx, attId: number, b: z.infer<typeof correctionInput>, source: 'ADMIN_CORRECTION' | 'ADMIN_EXCEPTIONNEL') {
  const tz = await companyTz();
  const [att] = await tx.select().from(schema.attendances).where(eq(schema.attendances.id, attId));
  const newArr = b.arrivalAt !== undefined ? (b.arrivalAt ? new Date(b.arrivalAt) : null) : att.arrivalAt;
  const newDep = b.departureAt !== undefined ? (b.departureAt ? new Date(b.departureAt) : null) : att.departureAt;
  if (newDep && !newArr) throw badRequest('DEPART_SANS_ARRIVEE', 'Un départ ne peut pas être enregistré sans arrivée.');
  if (newArr && newDep && newDep <= newArr) throw badRequest('INCOHERENT', "L'heure de départ doit être postérieure à l'heure d'arrivée.");
  if (newArr && newArr > new Date()) throw badRequest('FUTURE', 'Une heure de pointage ne peut pas être dans le futur.');
  if (newArr && (newArr.getTime() < new Date(`${att.workDate}T00:00:00Z`).getTime() - 36 * 3600_000 || newArr.getTime() > new Date(`${att.workDate}T00:00:00Z`).getTime() + 48 * 3600_000)) {
    throw badRequest('INCOHERENT', "L'heure d'arrivée ne correspond pas à la journée concernée.");
  }
  const changes: { field: string; old: string | null; new: string | null }[] = [];
  for (const [field, type, oldV, newV] of [['arrivalAt', 'ARRIVEE', att.arrivalAt, newArr], ['departureAt', 'DEPART', att.departureAt, newDep]] as const) {
    if ((oldV?.getTime() ?? null) === (newV?.getTime() ?? null)) continue;
    changes.push({ field, old: oldV?.toISOString() ?? null, new: newV?.toISOString() ?? null });
    // l'événement initial n'est jamais écrasé : il est marqué « remplacé » par l'événement de correction
    const { rows } = await tx.execute(sql`SELECT nextval(pg_get_serial_sequence('attendance_events','id'))::int AS id`);
    const newId = (rows[0] as any).id as number;
    const [prev] = await tx.select().from(schema.attendanceEvents).where(and(eq(schema.attendanceEvents.attendanceId, attId), eq(schema.attendanceEvents.type, type),
      eq(schema.attendanceEvents.result, 'ACCEPTE'), isNull(schema.attendanceEvents.supersededBy)));
    if (prev) await tx.update(schema.attendanceEvents).set({ supersededBy: newId }).where(eq(schema.attendanceEvents.id, prev.id));
    if (newV) {
      await tx.insert(schema.attendanceEvents).values({ id: newId, attendanceId: attId, employeeId: att.employeeId, workDate: att.workDate, type, serverTime: newV, source, result: 'ACCEPTE',
        reasonMessage: b.reason, createdBy: req.user!.id, ip: req.ip, userAgent: req.get('user-agent') ?? null, meta: { correctedAt: new Date().toISOString(), previous: oldV?.toISOString() ?? null } });
    }
  }
  if (b.dayStatus !== undefined && b.dayStatus !== att.dayStatusOverride) changes.push({ field: 'dayStatus', old: att.dayStatusOverride ?? att.dayStatus, new: b.dayStatus });
  if (!changes.length) throw badRequest('NO_CHANGE', 'Aucune modification à enregistrer.');
  for (const c of changes) {
    await tx.insert(schema.attendanceCorrections).values({ attendanceId: attId, field: source === 'ADMIN_EXCEPTIONNEL' ? `EXCEPTIONNEL:${c.field}` : c.field, oldValue: c.old, newValue: c.new, reason: b.reason, adminUserId: req.user!.id });
  }
  // un départ sans pause clôturée ferme les pauses ouvertes
  if (newDep) await tx.update(schema.attendanceBreaks).set({ endAt: newDep }).where(and(eq(schema.attendanceBreaks.attendanceId, attId), isNull(schema.attendanceBreaks.endAt)));
  const state = newArr && newDep ? 'PARTI' : newArr ? (att.isClosed ? 'POINTAGE_INCOMPLET' : (att.state === 'EN_PAUSE' || att.state === 'DE_RETOUR_DE_PAUSE' ? att.state : 'PRESENT')) : 'NON_POINTE';
  await tx.update(schema.attendances).set({ arrivalAt: newArr, departureAt: newDep, state, corrected: true,
    dayStatusOverride: b.dayStatus !== undefined ? b.dayStatus : att.dayStatusOverride, updatedAt: new Date() }).where(eq(schema.attendances.id, attId));
  const rc = await recomputeAttendance(tx, attId);
  // anomalies résolues par la régularisation + trace de la correction manuelle
  const resolvable = ['DEPART_MANQUANT', 'ARRIVEE_MANQUANTE', 'PAUSE_NON_TERMINEE', 'DEPART_SANS_ARRIVEE'] as const;
  await tx.update(schema.anomalies).set({ status: 'RESOLUE', resolvedBy: req.user!.id, resolvedAt: new Date(), resolutionNote: `Régularisation : ${b.reason}` })
    .where(and(eq(schema.anomalies.attendanceId, attId), inArray(schema.anomalies.type, resolvable as any), inArray(schema.anomalies.status, ['OUVERTE', 'EN_COURS'])));
  await tx.insert(schema.anomalies).values({ employeeId: att.employeeId, attendanceId: attId, workDate: att.workDate, type: 'CORRECTION_MANUELLE', severity: 'FAIBLE',
    status: 'RESOLUE', message: `Pointage corrigé manuellement par ${req.user!.login}.`, details: changes as any, resolvedBy: req.user!.id, resolvedAt: new Date(), resolutionNote: b.reason });
  await notifyEmployee(att.employeeId, { type: 'CORRECTION', title: 'Pointage régularisé', body: `Votre journée du ${att.workDate} a été corrigée par les RH (${changes.map((c) => c.field === 'arrivalAt' ? `arrivée ${fmtTime(newArr, tz)}` : c.field === 'departureAt' ? `départ ${fmtTime(newDep, tz)}` : 'qualification').join(', ')}). Motif : ${b.reason}`, link: '/app/history' }, tx);
  await audit(req, source === 'ADMIN_EXCEPTIONNEL' ? 'ATTENDANCE_EXCEPTIONAL' : 'ATTENDANCE_CORRECTED', { entity: 'attendance', entityId: attId, before: { arrivalAt: att.arrivalAt, departureAt: att.departureAt, dayStatus: att.dayStatus }, after: changes, reason: b.reason }, tx);
  return rc?.attendance;
}

router.post('/:id/correct', requireRole(...ADMINS), ah(async (req, res) => {
  const id = parse(zId, req.params.id);
  const b = parse(correctionInput, req.body);
  const [exists] = await db.select({ id: schema.attendances.id }).from(schema.attendances).where(eq(schema.attendances.id, id));
  if (!exists) throw notFound();
  const updated = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM attendances WHERE id = ${id} FOR UPDATE`);
    return applyCorrection(req, tx, id, b, 'ADMIN_CORRECTION');
  });
  const [r] = await attendanceSelect().where(eq(schema.attendances.id, updated!.id));
  res.json(attendanceDto(r));
}));

router.post('/exceptional', requireRole(...ADMINS), ah(async (req, res) => {
  const b = parse(correctionInput.extend({ employeeId: zId, workDate: zDate }), req.body);
  const [emp] = await db.select().from(schema.employees).where(eq(schema.employees.id, b.employeeId));
  if (!emp) throw notFound('Employé introuvable');
  const tz = await companyTz();
  if (b.workDate > localDate(new Date(), tz)) throw badRequest('FUTURE', 'Impossible de créer un pointage pour une date future.');
  const sched = await resolveSchedule(emp.id, b.workDate);
  const updated = await db.transaction(async (tx) => {
    const att = await lockAttendance(tx, emp.id, b.workDate, sched?.version.id ?? null);
    if (att.arrivalAt && b.arrivalAt) throw conflict('ATTENDANCE_EXISTS', 'Une arrivée existe déjà pour cette journée : utilisez la correction.');
    return applyCorrection(req, tx, att.id, b, 'ADMIN_EXCEPTIONNEL');
  });
  const [r] = await attendanceSelect().where(eq(schema.attendances.id, updated!.id));
  res.status(201).json(attendanceDto(r));
}));

export { raiseAnomaly };
