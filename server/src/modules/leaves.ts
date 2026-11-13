import { Router, type Request } from 'express';
import { z } from 'zod';
import { and, desc, eq, gte, lte, ne, notInArray, or, sql, inArray } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import type { Tx } from '../db/index.js';
import { ah, parse, zDate, zId, pageParams } from '../utils/http.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors.js';
import { requireRole, ADMINS, STAFF, departmentScope, assertCanAccessEmployee } from '../middlewares/auth.js';
import { audit } from '../services/audit.js';
import { empBrief } from '../services/dto.js';
import { uploadDoc, storeUpload, absUpload } from '../services/files.js';
import { notifyEmployee, notifyUsers, managerUserIdsFor, hrUserIds } from '../services/notify.js';
import { loadScheduleResolver, toRules } from '../services/schedule.js';
import { loadHolidays } from '../services/dayContext.js';
import { isScheduledWorkDay } from '../services/calc.js';
import { recomputeAttendance, raiseAnomaly } from '../services/attendance.js';
import { companyTz } from '../services/settings.js';
import { eachDate, localDate, fmtDate } from '../utils/time.js';

/* --------------------------------------------------------------- types */
export const leaveTypesRouter = Router();
const ltInput = z.object({ code: z.string().trim().min(2).max(30).regex(/^[A-Z0-9_]+$/i).transform((s) => s.toUpperCase()), label: z.string().trim().min(2).max(120),
  category: z.enum(['CONGE', 'PERMISSION', 'MISSION', 'MALADIE', 'AUTRE']), paid: z.boolean().default(true), requiresJustification: z.boolean().default(false),
  requiresHrValidation: z.boolean().default(true), color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().nullable(), active: z.boolean().default(true) });
leaveTypesRouter.get('/', ah(async (req, res) => {
  const all = req.query.all === '1' && req.user!.role !== 'EMPLOYEE';
  res.json(await db.select().from(schema.leaveTypes).where(all ? undefined : eq(schema.leaveTypes.active, true)).orderBy(schema.leaveTypes.label));
}));
leaveTypesRouter.post('/', requireRole(...ADMINS), ah(async (req, res) => {
  const b = parse(ltInput, req.body);
  const [t] = await db.insert(schema.leaveTypes).values(b).onConflictDoNothing().returning();
  if (!t) throw conflict('DUPLICATE', 'Ce code existe déjà.');
  await audit(req, 'LEAVE_TYPE_CREATED', { entity: 'leave_type', entityId: t.id, after: t });
  res.status(201).json(t);
}));
leaveTypesRouter.put('/:id', requireRole(...ADMINS), ah(async (req, res) => {
  const id = parse(zId, req.params.id);
  const [t] = await db.update(schema.leaveTypes).set(parse(ltInput.partial(), req.body)).where(eq(schema.leaveTypes.id, id)).returning();
  if (!t) throw notFound();
  await audit(req, 'LEAVE_TYPE_UPDATED', { entity: 'leave_type', entityId: id, after: t });
  res.json(t);
}));

/* ------------------------------------------------------------ demandes */
export const router = Router();

async function workingDaysFor(employeeId: number, from: string, to: string) {
  const [emp] = await db.select().from(schema.employees).where(eq(schema.employees.id, employeeId));
  const resolve = await loadScheduleResolver();
  const holidays = await loadHolidays();
  return eachDate(from, to).filter((d) => { const r = resolve(emp, d); return r && isScheduledWorkDay(d, toRules(r.version)) && !holidays.label(d); }).length;
}

/** Applique l'effet d'une décision sur les journées déjà existantes (absence → congé, etc.) */
async function reapplyDays(tx: Tx, employeeId: number, from: string, to: string) {
  const atts = await tx.select({ id: schema.attendances.id, arrival: schema.attendances.arrivalAt, workDate: schema.attendances.workDate }).from(schema.attendances)
    .where(and(eq(schema.attendances.employeeId, employeeId), gte(schema.attendances.workDate, from), lte(schema.attendances.workDate, to)));
  for (const a of atts) {
    await recomputeAttendance(tx, a.id);
    if (a.arrival) await raiseAnomaly(tx, { employeeId, attendanceId: a.id, workDate: a.workDate, type: 'JOUR_NON_TRAVAILLE', severity: 'MOYENNE', message: 'Pointage enregistré pendant un congé approuvé.' });
  }
  await tx.update(schema.anomalies).set({ status: 'RESOLUE', resolvedAt: new Date(), resolutionNote: 'Couvert par une absence autorisée' })
    .where(and(eq(schema.anomalies.employeeId, employeeId), eq(schema.anomalies.type, 'ARRIVEE_MANQUANTE'), gte(schema.anomalies.workDate, from), lte(schema.anomalies.workDate, to), inArray(schema.anomalies.status, ['OUVERTE', 'EN_COURS'])));
}

async function isManagerOf(req: Request, employeeId: number) {
  const u = req.user!;
  if (u.role !== 'MANAGER' || !u.employeeId || u.employeeId === employeeId) return false;
  const [e] = await db.select().from(schema.employees).where(eq(schema.employees.id, employeeId));
  return !!e && (e.managerId === u.employeeId || (!!u.departmentId && e.departmentId === u.departmentId));
}

function leaveQuery() {
  return db.select({ l: schema.leaveRequests, t: schema.leaveTypes, ...empBrief, managerId: schema.employees.managerId, j: schema.justifications })
    .from(schema.leaveRequests)
    .innerJoin(schema.leaveTypes, eq(schema.leaveTypes.id, schema.leaveRequests.leaveTypeId))
    .innerJoin(schema.employees, eq(schema.employees.id, schema.leaveRequests.employeeId))
    .leftJoin(schema.departments, eq(schema.departments.id, schema.employees.departmentId))
    .leftJoin(schema.justifications, eq(schema.justifications.id, schema.leaveRequests.justificationId));
}
function leaveDto(req: Request, r: any, today: string) {
  const u = req.user!; const l = r.l;
  const isHr = u.role === 'HR_ADMIN' || u.role === 'SUPER_ADMIN';
  const own = u.employeeId === l.employeeId;
  const mgr = u.role === 'MANAGER' && !own && (r.managerId === u.employeeId || (u.departmentId && r.departmentId === u.departmentId));
  return {
    ...l, employee: { fullName: r.fullName, matricule: r.matricule, departmentName: r.departmentName },
    leaveType: { id: r.t.id, code: r.t.code, label: r.t.label, category: r.t.category, color: r.t.color, requiresJustification: r.t.requiresJustification, requiresHrValidation: r.t.requiresHrValidation },
    justification: r.j ? { id: r.j.id, fileName: r.j.fileName, status: r.j.status, hasFile: !!r.j.filePath } : null,
    canManagerReview: l.status === 'EN_ATTENTE' && !l.managerDecision && (mgr || (isHr && !own)),
    canDecide: l.status === 'EN_ATTENTE' && isHr && !own,
    canCancel: (own && (l.status === 'BROUILLON' || l.status === 'EN_ATTENTE' || (l.status === 'APPROUVE' && l.startDate > today))) || (isHr && l.status !== 'ANNULE' && l.status !== 'REFUSE'),
    canSubmit: own && l.status === 'BROUILLON',
  };
}

router.get('/', ah(async (req, res) => {
  const q = parse(z.object({ scope: z.enum(['mine', 'team', 'all']).default('mine'), status: z.string().max(60).optional(), from: zDate.optional(), to: zDate.optional(),
    employeeId: zId.optional(), departmentId: zId.optional(), pending: z.enum(['1']).optional() }).passthrough(), req.query);
  const { page, pageSize, offset } = pageParams(req.query);
  const u = req.user!;
  const conds: any[] = [];
  if (q.scope === 'mine') conds.push(eq(schema.leaveRequests.employeeId, u.employeeId ?? -1));
  else if (u.role === 'EMPLOYEE') throw forbidden();
  else {
    const scope = departmentScope(req);
    if (scope === 'NONE') conds.push(sql`false`);
    else if (scope) conds.push(or(eq(schema.employees.departmentId, scope), eq(schema.employees.managerId, u.employeeId ?? -1)));
    // un brouillon reste privé à son auteur
    conds.push(ne(schema.leaveRequests.status, 'BROUILLON'));
  }
  if (q.status) conds.push(inArray(schema.leaveRequests.status, q.status.split(',') as any));
  if (q.from) conds.push(gte(schema.leaveRequests.endDate, q.from));
  if (q.to) conds.push(lte(schema.leaveRequests.startDate, q.to));
  if (q.employeeId) conds.push(eq(schema.leaveRequests.employeeId, q.employeeId));
  if (q.departmentId) conds.push(eq(schema.employees.departmentId, q.departmentId));
  if (q.pending) conds.push(eq(schema.leaveRequests.status, 'EN_ATTENTE'));
  const where = conds.length ? and(...conds) : undefined;
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(schema.leaveRequests).innerJoin(schema.employees, eq(schema.employees.id, schema.leaveRequests.employeeId)).where(where);
  const rows = await leaveQuery().where(where).orderBy(desc(schema.leaveRequests.createdAt)).limit(pageSize).offset(offset);
  const today = localDate(new Date(), await companyTz());
  res.json({ items: rows.map((r) => leaveDto(req, r, today)), total, page, pageSize });
}));

router.get('/calendar', requireRole(...STAFF), ah(async (req, res) => {
  const q = parse(z.object({ from: zDate, to: zDate, departmentId: zId.optional(), includePending: z.enum(['0', '1']).optional() }), req.query);
  const conds: any[] = [lte(schema.leaveRequests.startDate, q.to), gte(schema.leaveRequests.endDate, q.from),
    inArray(schema.leaveRequests.status, q.includePending === '0' ? ['APPROUVE'] : ['APPROUVE', 'EN_ATTENTE'])];
  const scope = departmentScope(req);
  if (scope === 'NONE') conds.push(sql`false`); else if (scope) conds.push(eq(schema.employees.departmentId, scope));
  if (q.departmentId) conds.push(eq(schema.employees.departmentId, q.departmentId));
  const rows = await leaveQuery().where(and(...conds)).orderBy(schema.leaveRequests.startDate);
  const holidays = (await loadHolidays()).rows;
  const hol = eachDate(q.from, q.to).map((d) => { const h = holidays.find((x) => x.date === d || (x.recurring && x.date.slice(5) === d.slice(5))); return h ? { date: d, label: h.label } : null; }).filter(Boolean);
  res.json({ items: rows.map((r) => ({ id: r.l.id, employeeId: r.l.employeeId, fullName: r.fullName, departmentName: r.departmentName, type: r.t.label, category: r.t.category,
    color: r.t.color, startDate: r.l.startDate, endDate: r.l.endDate, status: r.l.status })), holidays: hol });
}));

router.get('/:id', ah(async (req, res) => {
  const id = parse(zId, req.params.id);
  const [r] = await leaveQuery().where(eq(schema.leaveRequests.id, id));
  if (!r) throw notFound();
  await assertCanAccessEmployee(req, r.l.employeeId);
  res.json(leaveDto(req, r, localDate(new Date(), await companyTz())));
}));

const createInput = z.object({ leaveTypeId: zId, startDate: zDate, endDate: zDate, comment: z.string().max(1000).optional().nullable(),
  draft: z.union([z.boolean(), z.enum(['true', 'false']).transform((v) => v === 'true')]).optional(), employeeId: zId.optional() });

async function notifySubmitted(employeeId: number, leaveId: number, label: string, from: string, to: string) {
  const [e] = await db.select().from(schema.employees).where(eq(schema.employees.id, employeeId));
  const mgrs = await managerUserIdsFor(employeeId);
  const targets = mgrs.length ? mgrs : await hrUserIds();
  await notifyUsers(targets, { type: 'DEMANDE_CONGE', title: `Nouvelle demande : ${e.firstNames} ${e.lastName}`, body: `${label} du ${fmtDate(from)} au ${fmtDate(to)}.`, link: '/admin/leaves' });
  await notifyEmployee(employeeId, { type: 'DEMANDE_ENVOYEE', title: 'Demande envoyée', body: `${label} du ${fmtDate(from)} au ${fmtDate(to)} : en attente de validation.`, link: '/app/requests' });
}

router.post('/', uploadDoc.single('file'), ah(async (req, res) => {
  const b = parse(createInput, req.body);
  const u = req.user!;
  // un administrateur RH peut saisir une demande pour un employé ; sinon l'employé connecté
  const employeeId = b.employeeId && (u.role === 'HR_ADMIN' || u.role === 'SUPER_ADMIN') ? b.employeeId : u.employeeId;
  if (!employeeId) throw forbidden("Ce compte n'est pas rattaché à un employé.");
  if (b.endDate < b.startDate) throw badRequest('DATES', 'La date de fin précède la date de début.');
  const [t] = await db.select().from(schema.leaveTypes).where(eq(schema.leaveTypes.id, b.leaveTypeId));
  if (!t?.active) throw badRequest('LEAVE_TYPE', 'Type de demande inconnu ou inactif.');
  const [overlap] = await db.select({ id: schema.leaveRequests.id }).from(schema.leaveRequests).where(and(eq(schema.leaveRequests.employeeId, employeeId),
    notInArray(schema.leaveRequests.status, ['ANNULE', 'REFUSE']), lte(schema.leaveRequests.startDate, b.endDate), gte(schema.leaveRequests.endDate, b.startDate)));
  if (overlap) throw conflict('OVERLAP', 'Une autre demande couvre déjà tout ou partie de cette période.');
  const workingDays = await workingDaysFor(employeeId, b.startDate, b.endDate);
  if (workingDays === 0) throw badRequest('NO_WORKING_DAY', 'La période choisie ne contient aucun jour travaillé.');
  const filePath = req.file ? await storeUpload(req.file, 'justifications') : null;
  const leave = await db.transaction(async (tx) => {
    const [l] = await tx.insert(schema.leaveRequests).values({ employeeId, leaveTypeId: t.id, startDate: b.startDate, endDate: b.endDate, comment: b.comment ?? null, workingDays,
      status: b.draft ? 'BROUILLON' : 'EN_ATTENTE' }).returning();
    if (filePath) {
      const [j] = await tx.insert(schema.justifications).values({ employeeId, leaveRequestId: l.id, workDate: b.startDate, reason: `Justificatif — ${t.label}`, filePath,
        fileName: req.file!.originalname.slice(0, 200), mimeType: req.file!.mimetype }).returning();
      await tx.update(schema.leaveRequests).set({ justificationId: j.id }).where(eq(schema.leaveRequests.id, l.id));
    }
    await audit(req, 'LEAVE_CREATED', { entity: 'leave_request', entityId: l.id, after: { ...b, employeeId, workingDays } }, tx);
    return l;
  });
  if (!b.draft) await notifySubmitted(employeeId, leave.id, t.label, b.startDate, b.endDate);
  res.status(201).json(leave);
}));

async function loadLeave(id: number) {
  const [l] = await db.select().from(schema.leaveRequests).where(eq(schema.leaveRequests.id, id));
  if (!l) throw notFound('Demande introuvable');
  const [t] = await db.select().from(schema.leaveTypes).where(eq(schema.leaveTypes.id, l.leaveTypeId));
  return { l, t };
}

router.post('/:id/submit', ah(async (req, res) => {
  const { l, t } = await loadLeave(parse(zId, req.params.id));
  if (l.employeeId !== req.user!.employeeId) throw forbidden();
  if (l.status !== 'BROUILLON') throw conflict('INVALID_STATUS', 'Seul un brouillon peut être envoyé.');
  await db.update(schema.leaveRequests).set({ status: 'EN_ATTENTE', updatedAt: new Date() }).where(eq(schema.leaveRequests.id, l.id));
  await notifySubmitted(l.employeeId, l.id, t.label, l.startDate, l.endDate);
  await audit(req, 'LEAVE_SUBMITTED', { entity: 'leave_request', entityId: l.id });
  res.json({ ok: true });
}));

router.post('/:id/cancel', ah(async (req, res) => {
  const { l } = await loadLeave(parse(zId, req.params.id));
  const u = req.user!;
  const isHr = u.role === 'HR_ADMIN' || u.role === 'SUPER_ADMIN';
  const today = localDate(new Date(), await companyTz());
  const own = l.employeeId === u.employeeId;
  const allowed = (own && (l.status === 'BROUILLON' || l.status === 'EN_ATTENTE' || (l.status === 'APPROUVE' && l.startDate > today))) || (isHr && !['ANNULE', 'REFUSE'].includes(l.status));
  if (!allowed) throw conflict('INVALID_STATUS', 'Cette demande ne peut plus être annulée.');
  await db.transaction(async (tx) => {
    await tx.update(schema.leaveRequests).set({ status: 'ANNULE', updatedAt: new Date() }).where(eq(schema.leaveRequests.id, l.id));
    if (l.status === 'APPROUVE') await reapplyDays(tx, l.employeeId, l.startDate, l.endDate);
    await audit(req, 'LEAVE_CANCELLED', { entity: 'leave_request', entityId: l.id, before: { status: l.status } }, tx);
  });
  if (!own) await notifyEmployee(l.employeeId, { type: 'DEMANDE_ANNULEE', title: 'Demande annulée', body: `Votre demande du ${fmtDate(l.startDate)} a été annulée par les RH.`, link: '/app/requests' });
  res.json({ ok: true });
}));

router.post('/:id/manager-review', requireRole(...STAFF), ah(async (req, res) => {
  const b = parse(z.object({ decision: z.enum(['FAVORABLE', 'DEFAVORABLE']), comment: z.string().max(1000).optional().nullable() }), req.body);
  const { l, t } = await loadLeave(parse(zId, req.params.id));
  const u = req.user!;
  const isHr = u.role === 'HR_ADMIN' || u.role === 'SUPER_ADMIN';
  if (l.employeeId === u.employeeId) throw forbidden('Vous ne pouvez pas examiner votre propre demande.');
  if (!isHr && !(await isManagerOf(req, l.employeeId))) throw forbidden("Cette demande ne relève pas de votre périmètre.");
  if (l.status !== 'EN_ATTENTE' || l.managerDecision) throw conflict('INVALID_STATUS', 'Cette demande a déjà été examinée.');
  // Types ne nécessitant pas de validation RH : l'avis du responsable vaut décision
  const final = !t.requiresHrValidation ? (b.decision === 'FAVORABLE' ? 'APPROUVE' : 'REFUSE') : 'EN_ATTENTE';
  await db.transaction(async (tx) => {
    await tx.update(schema.leaveRequests).set({ managerDecision: b.decision, managerComment: b.comment ?? null, managerReviewedBy: u.id, managerReviewedAt: new Date(), status: final as any, updatedAt: new Date() })
      .where(eq(schema.leaveRequests.id, l.id));
    if (final === 'APPROUVE') await reapplyDays(tx, l.employeeId, l.startDate, l.endDate);
    await audit(req, 'LEAVE_MANAGER_REVIEW', { entity: 'leave_request', entityId: l.id, after: { ...b, status: final } }, tx);
  });
  if (final === 'EN_ATTENTE') {
    await notifyUsers(await hrUserIds(), { type: 'AVIS_RESPONSABLE', title: 'Avis du responsable reçu', body: `${t.label} du ${fmtDate(l.startDate)} : avis ${b.decision === 'FAVORABLE' ? 'favorable' : 'défavorable'}. Décision RH attendue.`, link: '/admin/leaves' });
    await notifyEmployee(l.employeeId, { type: 'AVIS_RESPONSABLE', title: 'Votre responsable a examiné votre demande', body: `Avis ${b.decision === 'FAVORABLE' ? 'favorable' : 'défavorable'} — en attente de validation RH.`, link: '/app/requests' });
  } else {
    await notifyEmployee(l.employeeId, { type: final === 'APPROUVE' ? 'DEMANDE_APPROUVEE' : 'DEMANDE_REFUSEE', title: final === 'APPROUVE' ? 'Demande approuvée' : 'Demande refusée',
      body: `${t.label} du ${fmtDate(l.startDate)} au ${fmtDate(l.endDate)}.${b.comment ? ` Commentaire : ${b.comment}` : ''}`, link: '/app/requests' });
  }
  res.json({ ok: true, status: final });
}));

router.post('/:id/decide', requireRole(...ADMINS), ah(async (req, res) => {
  const b = parse(z.object({ decision: z.enum(['APPROUVE', 'REFUSE']), comment: z.string().max(1000).optional().nullable() }), req.body);
  const { l, t } = await loadLeave(parse(zId, req.params.id));
  if (l.employeeId === req.user!.employeeId) throw forbidden('Vous ne pouvez pas valider votre propre demande.');
  if (l.status !== 'EN_ATTENTE') throw conflict('INVALID_STATUS', 'Cette demande n\'est plus en attente.');
  if (b.decision === 'REFUSE' && !b.comment?.trim()) throw badRequest('COMMENT_REQUIRED', 'Un commentaire est obligatoire pour un refus.');
  await db.transaction(async (tx) => {
    await tx.update(schema.leaveRequests).set({ status: b.decision, hrDecidedBy: req.user!.id, hrDecidedAt: new Date(), hrComment: b.comment ?? null, updatedAt: new Date() })
      .where(eq(schema.leaveRequests.id, l.id));
    if (b.decision === 'APPROUVE') await reapplyDays(tx, l.employeeId, l.startDate, l.endDate);
    await audit(req, 'LEAVE_DECIDED', { entity: 'leave_request', entityId: l.id, after: b }, tx);
  });
  await notifyEmployee(l.employeeId, { type: b.decision === 'APPROUVE' ? 'DEMANDE_APPROUVEE' : 'DEMANDE_REFUSEE', title: b.decision === 'APPROUVE' ? 'Demande approuvée' : 'Demande refusée',
    body: `${t.label} du ${fmtDate(l.startDate)} au ${fmtDate(l.endDate)}.${b.comment ? ` Commentaire : ${b.comment}` : ''}`, link: '/app/requests' });
  const mgrs = await managerUserIdsFor(l.employeeId);
  await notifyUsers(mgrs, { type: 'DEMANDE_DECIDEE', title: `Demande ${b.decision === 'APPROUVE' ? 'approuvée' : 'refusée'} par les RH`, body: `${t.label} du ${fmtDate(l.startDate)} au ${fmtDate(l.endDate)}.`, link: '/admin/leaves' });
  res.json({ ok: true });
}));

/* ---------------------------------------------------------- justificatifs */
export const justificationsRouter = Router();
justificationsRouter.get('/', ah(async (req, res) => {
  const q = parse(z.object({ scope: z.enum(['mine', 'all']).default('mine'), status: z.string().max(40).optional(), employeeId: zId.optional() }).passthrough(), req.query);
  const { page, pageSize, offset } = pageParams(req.query);
  const conds: any[] = [];
  if (q.scope === 'mine') conds.push(eq(schema.justifications.employeeId, req.user!.employeeId ?? -1));
  else {
    if (req.user!.role === 'EMPLOYEE') throw forbidden();
    const scope = departmentScope(req);
    if (scope === 'NONE') conds.push(sql`false`); else if (scope) conds.push(eq(schema.employees.departmentId, scope));
  }
  if (q.status) conds.push(inArray(schema.justifications.status, q.status.split(',') as any));
  if (q.employeeId) conds.push(eq(schema.justifications.employeeId, q.employeeId));
  const where = conds.length ? and(...conds) : undefined;
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(schema.justifications).innerJoin(schema.employees, eq(schema.employees.id, schema.justifications.employeeId)).where(where);
  const rows = await db.select({ j: schema.justifications, ...empBrief }).from(schema.justifications)
    .innerJoin(schema.employees, eq(schema.employees.id, schema.justifications.employeeId))
    .leftJoin(schema.departments, eq(schema.departments.id, schema.employees.departmentId))
    .where(where).orderBy(desc(schema.justifications.createdAt)).limit(pageSize).offset(offset);
  res.json({ items: rows.map(({ j, ...r }) => ({ id: j.id, employeeId: j.employeeId, employee: { fullName: r.fullName, matricule: r.matricule, departmentName: r.departmentName },
    workDate: j.workDate, attendanceId: j.attendanceId, leaveRequestId: j.leaveRequestId, reason: j.reason, fileName: j.fileName, mimeType: j.mimeType, hasFile: !!j.filePath,
    status: j.status, reviewComment: j.reviewComment, reviewedAt: j.reviewedAt, createdAt: j.createdAt })), total, page, pageSize });
}));

justificationsRouter.post('/', uploadDoc.single('file'), ah(async (req, res) => {
  const b = parse(z.object({ workDate: zDate.optional(), attendanceId: zId.optional(), leaveRequestId: zId.optional(), reason: z.string().trim().min(3).max(1000) }), req.body);
  const eid = req.user!.employeeId;
  if (!eid) throw forbidden("Ce compte n'est pas rattaché à un employé.");
  let att: typeof schema.attendances.$inferSelect | undefined;
  if (b.attendanceId) [att] = await db.select().from(schema.attendances).where(and(eq(schema.attendances.id, b.attendanceId), eq(schema.attendances.employeeId, eid)));
  else if (b.workDate) [att] = await db.select().from(schema.attendances).where(and(eq(schema.attendances.workDate, b.workDate), eq(schema.attendances.employeeId, eid)));
  if (b.attendanceId && !att) throw notFound('Journée introuvable');
  if (b.leaveRequestId) {
    const [l] = await db.select().from(schema.leaveRequests).where(and(eq(schema.leaveRequests.id, b.leaveRequestId), eq(schema.leaveRequests.employeeId, eid)));
    if (!l) throw notFound('Demande introuvable');
  }
  const filePath = req.file ? await storeUpload(req.file, 'justifications') : null;
  const j = await db.transaction(async (tx) => {
    const [j] = await tx.insert(schema.justifications).values({ employeeId: eid, attendanceId: att?.id ?? null, leaveRequestId: b.leaveRequestId ?? null,
      workDate: b.workDate ?? att?.workDate ?? null, reason: b.reason, filePath, fileName: req.file?.originalname.slice(0, 200) ?? null, mimeType: req.file?.mimetype ?? null }).returning();
    if (att) await tx.update(schema.attendances).set({ justificationId: j.id }).where(eq(schema.attendances.id, att.id));
    if (b.leaveRequestId) await tx.update(schema.leaveRequests).set({ justificationId: j.id }).where(eq(schema.leaveRequests.id, b.leaveRequestId));
    await audit(req, 'JUSTIFICATION_SUBMITTED', { entity: 'justification', entityId: j.id, after: b }, tx);
    return j;
  });
  await notifyUsers(await hrUserIds(), { type: 'JUSTIFICATIF', title: 'Nouveau justificatif déposé', body: b.reason.slice(0, 140), link: '/admin/absences' });
  res.status(201).json(j);
}));

justificationsRouter.get('/:id/file', ah(async (req, res) => {
  const id = parse(zId, req.params.id);
  const [j] = await db.select().from(schema.justifications).where(eq(schema.justifications.id, id));
  if (!j || !j.filePath) throw notFound('Fichier introuvable');
  await assertCanAccessEmployee(req, j.employeeId);
  if (req.user!.role !== 'EMPLOYEE' && req.user!.employeeId !== j.employeeId) await audit(req, 'JUSTIFICATION_VIEWED', { entity: 'justification', entityId: id });
  res.setHeader('Content-Type', j.mimeType ?? 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(j.fileName ?? 'justificatif')}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.sendFile(absUpload(j.filePath), { root: '/' });
}));

justificationsRouter.post('/:id/review', requireRole(...ADMINS), ah(async (req, res) => {
  const id = parse(zId, req.params.id);
  const b = parse(z.object({ status: z.enum(['VALIDE', 'REJETE']), comment: z.string().max(1000).optional().nullable() }), req.body);
  const [j] = await db.select().from(schema.justifications).where(eq(schema.justifications.id, id));
  if (!j) throw notFound();
  if (j.status !== 'EN_ATTENTE') throw conflict('INVALID_STATUS', 'Ce justificatif a déjà été examiné.');
  await db.transaction(async (tx) => {
    await tx.update(schema.justifications).set({ status: b.status, reviewComment: b.comment ?? null, reviewedBy: req.user!.id, reviewedAt: new Date() }).where(eq(schema.justifications.id, id));
    if (j.attendanceId) {
      await recomputeAttendance(tx, j.attendanceId);
      if (b.status === 'VALIDE') await tx.update(schema.anomalies).set({ status: 'RESOLUE', resolvedBy: req.user!.id, resolvedAt: new Date(), resolutionNote: 'Absence justifiée' })
        .where(and(eq(schema.anomalies.attendanceId, j.attendanceId), eq(schema.anomalies.type, 'ARRIVEE_MANQUANTE'), inArray(schema.anomalies.status, ['OUVERTE', 'EN_COURS'])));
    }
    await audit(req, 'JUSTIFICATION_REVIEWED', { entity: 'justification', entityId: id, after: b }, tx);
  });
  await notifyEmployee(j.employeeId, { type: b.status === 'VALIDE' ? 'JUSTIFICATIF_VALIDE' : 'JUSTIFICATIF_REJETE', title: b.status === 'VALIDE' ? 'Justificatif accepté' : 'Justificatif refusé',
    body: `${j.workDate ? `Journée du ${fmtDate(j.workDate)}. ` : ''}${b.comment ?? ''}`, link: '/app/requests' });
  res.json({ ok: true });
}));
