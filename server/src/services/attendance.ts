/**
 * Service central des journées de présence : création, recalcul, qualification,
 * anomalies et clôture de fin de journée. Toute la logique RH passe par ici.
 */
import { and, eq, inArray, isNull, lte, sql, ne } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import type { Tx } from '../db/index.js';
import { computeDay, shiftBounds, isScheduledWorkDay } from './calc.js';
import { loadScheduleResolver, toRules, type ScheduleVersion } from './schedule.js';
import { loadHolidays, loadApprovedLeaves, leaveDayStatus } from './dayContext.js';
import { getSettings, companyTz } from './settings.js';
import { addDays, localDate } from '../utils/time.js';
import { hrUserIds, notifyUsers, managerUserIdsFor, notifyEmployee } from './notify.js';

type Attendance = typeof schema.attendances.$inferSelect;
type AnomalyType = typeof schema.anomalyTypeEnum.enumValues[number];
type Severity = typeof schema.severityEnum.enumValues[number];

export async function raiseAnomaly(d: typeof db | Tx, a: {
  employeeId: number; attendanceId?: number | null; workDate: string; type: AnomalyType; severity: Severity; message: string; details?: unknown;
}) {
  const rows = await d.insert(schema.anomalies).values({ ...a, details: (a.details ?? null) as any })
    .onConflictDoNothing().returning({ id: schema.anomalies.id });
  if (rows.length && (a.severity === 'ELEVEE' || a.severity === 'CRITIQUE')) {
    const ids = [...(await hrUserIds(d as Tx)), ...(await managerUserIdsFor(a.employeeId, d as Tx))];
    await notifyUsers(ids, { type: 'ANOMALIE', title: 'Anomalie de pointage détectée', body: a.message, link: '/admin/anomalies' }, d as Tx);
  }
  return rows[0]?.id;
}

/** Obtient (ou crée) la journée et la verrouille (SELECT … FOR UPDATE) — base de l'anti-doublon concurrent */
export async function lockAttendance(tx: Tx, employeeId: number, workDate: string, scheduleVersionId: number | null) {
  await tx.insert(schema.attendances).values({ employeeId, workDate, scheduleVersionId }).onConflictDoNothing();
  const r = await tx.execute(sql`SELECT id FROM attendances WHERE employee_id = ${employeeId} AND work_date = ${workDate} FOR UPDATE`);
  const id = (r.rows[0] as any).id as number;
  const [att] = await tx.select().from(schema.attendances).where(eq(schema.attendances.id, id));
  return att;
}

/** Recalcule tous les indicateurs d'une journée à partir de ses données sources et de SA version d'horaire */
export async function recomputeAttendance(tx: Tx, attendanceId: number, opts: { close?: boolean } = {}) {
  const [att] = await tx.select().from(schema.attendances).where(eq(schema.attendances.id, attendanceId));
  if (!att) return null;
  const tz = await companyTz();
  const version = att.scheduleVersionId
    ? (await tx.select().from(schema.scheduleVersions).where(eq(schema.scheduleVersions.id, att.scheduleVersionId)))[0] : null;
  const rules = version ? toRules(version) : null;
  const breaks = await tx.select().from(schema.attendanceBreaks).where(eq(schema.attendanceBreaks.attendanceId, att.id));
  const holidays = await loadHolidays(tx);
  const leaves = await loadApprovedLeaves(att.workDate, att.workDate, [att.employeeId], tx);
  const holiday = holidays.label(att.workDate);
  const leave = leaves.get(att.employeeId, att.workDate);
  const c = computeDay({
    workDate: att.workDate, tz, rules, arrivalAt: att.arrivalAt, departureAt: att.departureAt,
    breaks: breaks.map((b) => ({ start: b.startAt, end: b.endAt })), ctx: { isHoliday: !!holiday, onLeave: !!leave },
  });
  const isClosed = opts.close || att.isClosed;
  let justified = false;
  if (!att.arrivalAt && att.justificationId) {
    const [j] = await tx.select().from(schema.justifications).where(eq(schema.justifications.id, att.justificationId));
    justified = j?.status === 'VALIDE';
  }
  const dayStatus = classifyDay({
    arrival: !!att.arrivalAt, departure: !!att.departureAt, late: c.lateMinutes > 0, closed: isClosed,
    holiday: !!holiday, workingDay: !!rules && isScheduledWorkDay(att.workDate, rules), leaveCategory: leave?.category ?? null, justified,
    hasSchedule: !!rules,
  });
  const finalStatus = att.dayStatusOverride ?? dayStatus;
  let state = att.state;
  if (isClosed && !att.corrected) {
    if (att.arrivalAt && !att.departureAt) state = 'POINTAGE_INCOMPLET';
  }
  if (att.arrivalAt && att.departureAt) state = 'PARTI';
  const [updated] = await tx.update(schema.attendances).set({
    expectedMinutes: c.expectedMinutes, lateRawMinutes: c.lateRawMinutes, lateMinutes: c.lateMinutes,
    earlyLeaveMinutes: c.earlyLeaveMinutes, presenceMinutes: c.presenceMinutes, breakMinutes: c.breakMinutes,
    workedMinutes: c.workedMinutes, normalMinutes: c.normalMinutes, overtimePotentialMinutes: c.overtimePotentialMinutes,
    dayStatus: finalStatus, state, isClosed, leaveRequestId: leave?.requestId ?? null, updatedAt: new Date(),
  }).where(eq(schema.attendances.id, att.id)).returning();

  // Heures supplémentaires potentielles → enregistrement à valider (jamais validées automatiquement si la politique l'exige)
  const settings = await getSettings();
  if (c.overtimePotentialMinutes > 0 && att.departureAt) {
    const auto = !settings.overtime.requireValidation;
    await tx.insert(schema.overtimeRecords).values({
      attendanceId: att.id, employeeId: att.employeeId, workDate: att.workDate, potentialMinutes: c.overtimePotentialMinutes,
      status: auto ? 'VALIDE' : 'EN_ATTENTE', validatedMinutes: auto ? c.overtimePotentialMinutes : null,
    }).onConflictDoUpdate({
      target: schema.overtimeRecords.attendanceId,
      set: { potentialMinutes: c.overtimePotentialMinutes, updatedAt: new Date() },
    });
  } else {
    // si la correction fait disparaître l'excédent, on retire l'enregistrement encore en attente
    await tx.delete(schema.overtimeRecords).where(and(eq(schema.overtimeRecords.attendanceId, att.id), eq(schema.overtimeRecords.status, 'EN_ATTENTE')));
  }
  return { attendance: updated, computation: c, rules, version, holiday, leave };
}

export function classifyDay(p: {
  arrival: boolean; departure: boolean; late: boolean; closed: boolean; holiday: boolean; workingDay: boolean;
  leaveCategory: string | null; justified: boolean; hasSchedule: boolean;
}): typeof schema.dayStatusEnum.enumValues[number] {
  if (p.arrival) {
    if (!p.departure && p.closed) return 'INCOMPLET';
    return p.late ? 'RETARD' : 'PRESENT';
  }
  if (p.holiday) return 'FERIE';
  if (p.hasSchedule && !p.workingDay) return 'NON_TRAVAILLE';
  if (p.leaveCategory) return leaveDayStatus(p.leaveCategory);
  if (p.justified) return 'ABSENCE_JUSTIFIEE';
  // Une absence n'est déclarée non justifiée qu'après la clôture de la journée
  return p.closed ? (p.hasSchedule ? 'ABSENCE_NON_JUSTIFIEE' : 'NON_TRAVAILLE') : 'EN_COURS';
}

/**
 * Détermine la journée de travail à laquelle rattacher un pointage effectué à l'instant `now`.
 * Gère les horaires de nuit : un départ à 05:50 appartient à la journée de la veille si celle-ci est ouverte.
 */
export async function resolveWorkDate(tx: Tx | typeof db, employee: { id: number; departmentId: number | null }, now: Date, tz: string) {
  const resolve = await loadScheduleResolver(tx);
  const today = localDate(now, tz);
  const yesterday = addDays(today, -1);
  const ry = resolve(employee, yesterday);
  if (ry) {
    const rules = toRules(ry.version);
    const b = shiftBounds(yesterday, rules, tz);
    if (b.crossesMidnight && now.getTime() < b.end.getTime() + 6 * 3600_000) {
      const [ya] = await tx.select().from(schema.attendances).where(and(eq(schema.attendances.employeeId, employee.id), eq(schema.attendances.workDate, yesterday)));
      const open = ya && ya.arrivalAt && !ya.departureAt && !ya.isClosed;
      const lateArrival = !ya?.arrivalAt && now < b.end && isScheduledWorkDay(yesterday, rules);
      if (open || lateArrival) return { workDate: yesterday, resolved: ry };
    }
  }
  return { workDate: today, resolved: resolve(employee, today) };
}

/** Une journée est clôturable quand sa fin théorique (+ marge) est passée, ou à minuit + marge sans horaire */
export function isDayClosable(workDate: string, version: ScheduleVersion | null, tz: string, now: Date, graceMin: number) {
  if (version) {
    const b = shiftBounds(workDate, toRules(version), tz);
    return now.getTime() > b.end.getTime() + graceMin * 60_000;
  }
  return localDate(now, tz) > workDate;
}

/**
 * Clôture des journées passées : crée les journées manquantes, qualifie les absences
 * (en tenant compte des congés, permissions, jours fériés et justificatifs) et détecte les anomalies.
 */
export async function closeDays(opts: { daysBack?: number; now?: Date; date?: string } = {}) {
  const now = opts.now ?? new Date();
  const tz = await companyTz();
  const settings = await getSettings();
  const company = (await db.select().from(schema.companies).limit(1))[0];
  if (!company?.clockingEnabled) return { closed: 0 };
  const activation = company.activatedAt ? localDate(company.activatedAt, tz) : localDate(now, tz);
  const today = localDate(now, tz);
  const dates: string[] = [];
  if (opts.date) dates.push(opts.date);
  else for (let i = opts.daysBack ?? 7; i >= 0; i--) { const d = addDays(today, -i); if (d >= activation) dates.push(d); }
  const resolve = await loadScheduleResolver();
  const emps = await db.select().from(schema.employees).where(eq(schema.employees.status, 'ACTIVE'));
  let closed = 0;
  for (const date of dates) {
    for (const e of emps) {
      if (e.hireDate && e.hireDate > date) continue;
      const r = resolve(e, date);
      const [existing] = await db.select().from(schema.attendances).where(and(eq(schema.attendances.employeeId, e.id), eq(schema.attendances.workDate, date)));
      if (existing?.isClosed) continue;
      const version = existing?.scheduleVersionId
        ? (await db.select().from(schema.scheduleVersions).where(eq(schema.scheduleVersions.id, existing.scheduleVersionId)))[0] ?? null
        : r?.version ?? null;
      if (!isDayClosable(date, version, tz, now, settings.clocking.dayCloseGraceMinutes)) continue;
      await db.transaction(async (tx) => {
        const att = await lockAttendance(tx, e.id, date, version?.id ?? null);
        if (att.isClosed) return;
        const wasOnBreak = att.state === 'EN_PAUSE';
        if (wasOnBreak) {
          await raiseAnomaly(tx, { employeeId: e.id, attendanceId: att.id, workDate: date, type: 'PAUSE_NON_TERMINEE', severity: 'MOYENNE', message: 'Pause commencée mais jamais terminée.' });
        }
        const res = await recomputeAttendance(tx, att.id, { close: true });
        if (!res) return;
        const a = res.attendance;
        if (a.arrivalAt && !a.departureAt) {
          await raiseAnomaly(tx, { employeeId: e.id, attendanceId: a.id, workDate: date, type: 'DEPART_MANQUANT', severity: 'MOYENNE', message: 'Arrivée enregistrée sans départ : oubli de pointage de sortie probable.' });
          await notifyEmployee(e.id, { type: 'OUBLI_POINTAGE', title: 'Départ non pointé', body: `Votre départ du ${date} n'a pas été pointé. Contactez les RH pour régulariser.`, link: '/app/history' }, tx);
        }
        if (a.dayStatus === 'ABSENCE_NON_JUSTIFIEE') {
          await raiseAnomaly(tx, { employeeId: e.id, attendanceId: a.id, workDate: date, type: 'ARRIVEE_MANQUANTE', severity: 'FAIBLE', message: "Aucun pointage sur une journée travaillée (absence non justifiée à ce stade)." });
          await notifyEmployee(e.id, { type: 'JUSTIFICATIF_DEMANDE', title: 'Absence à justifier', body: `Aucun pointage le ${date}. Vous pouvez déposer un justificatif.`, link: '/app/requests' }, tx);
        }
        if (a.workedMinutes > settings.anomalies.maxWorkMinutes) {
          await raiseAnomaly(tx, { employeeId: e.id, attendanceId: a.id, workDate: date, type: 'DUREE_ANORMALE', severity: 'ELEVEE', message: `Durée de travail anormale : ${Math.round(a.workedMinutes / 6) / 10} h.` });
        }
        closed++;
      });
    }
  }
  return { closed };
}

export { inArray, isNull, lte, ne };
