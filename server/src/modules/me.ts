import { Router } from 'express';
import { z } from 'zod';
import QRCode from 'qrcode';
import { DateTime } from 'luxon';
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { ah, parse, zDate } from '../utils/http.js';
import { forbidden } from '../utils/errors.js';
import { attendanceSelect, attendanceDto } from './attendance.js';
import { ensureQr, badgePayload } from './employees.js';
import { loadHolidays, loadApprovedLeaves } from '../services/dayContext.js';
import { loadScheduleResolver, toRules } from '../services/schedule.js';
import { isScheduledWorkDay } from '../services/calc.js';
import { eachDate } from '../utils/time.js';

export const router = Router();
router.use((req, _res, next) => next(req.user!.employeeId ? undefined : forbidden("Ce compte n'est pas rattaché à un employé.")));
const zMonth = z.string().regex(/^\d{4}-\d{2}$/);
const monthBounds = (m?: string) => {
  const d = m ? DateTime.fromISO(`${m}-01`) : DateTime.now().setZone('Africa/Abidjan').startOf('month');
  return { from: d.toISODate()!, to: d.endOf('month').toISODate()! };
};

router.get('/summary', ah(async (req, res) => {
  const { month } = parse(z.object({ month: zMonth.optional() }), req.query);
  const { from, to } = monthBounds(month);
  const eid = req.user!.employeeId!;
  const [s] = await db.select({
    workedMinutes: sql<number>`coalesce(sum(worked_minutes),0)::int`, expectedMinutes: sql<number>`coalesce(sum(expected_minutes),0)::int`,
    lateCount: sql<number>`count(*) filter (where late_minutes > 0)::int`, lateMinutes: sql<number>`coalesce(sum(late_minutes),0)::int`,
    absences: sql<number>`count(*) filter (where day_status = 'ABSENCE_NON_JUSTIFIEE')::int`,
    justifiedAbsences: sql<number>`count(*) filter (where day_status = 'ABSENCE_JUSTIFIEE')::int`,
    overtimePotential: sql<number>`coalesce(sum(overtime_potential_minutes),0)::int`,
    daysPresent: sql<number>`count(*) filter (where arrival_at is not null)::int`,
    leaveDaysTaken: sql<number>`count(*) filter (where day_status in ('CONGE','PERMISSION','MISSION'))::int`,
    incomplete: sql<number>`count(*) filter (where day_status = 'INCOMPLET')::int`,
  }).from(schema.attendances).where(and(eq(schema.attendances.employeeId, eid), gte(schema.attendances.workDate, from), lte(schema.attendances.workDate, to)));
  const [ot] = await db.select({ v: sql<number>`coalesce(sum(validated_minutes),0)::int` }).from(schema.overtimeRecords)
    .where(and(eq(schema.overtimeRecords.employeeId, eid), eq(schema.overtimeRecords.status, 'VALIDE'), gte(schema.overtimeRecords.workDate, from), lte(schema.overtimeRecords.workDate, to)));
  res.json({ month: from.slice(0, 7), from, to, ...s, overtimeValidated: ot.v });
}));

router.get('/attendance', ah(async (req, res) => {
  const q = parse(z.object({ from: zDate.optional(), to: zDate.optional() }), req.query);
  const conds = [eq(schema.attendances.employeeId, req.user!.employeeId!)];
  if (q.from) conds.push(gte(schema.attendances.workDate, q.from));
  if (q.to) conds.push(lte(schema.attendances.workDate, q.to));
  const rows = await attendanceSelect().where(and(...conds)).orderBy(desc(schema.attendances.workDate)).limit(400);
  res.json(rows.map(attendanceDto));
}));

router.get('/qrcode', ah(async (req, res) => {
  const q = await ensureQr(req.user!.employeeId!);
  res.json({ token: badgePayload(q.token), png: await QRCode.toDataURL(badgePayload(q.token), { margin: 1, width: 320 }) });
}));

router.get('/calendar', ah(async (req, res) => {
  const { month } = parse(z.object({ month: zMonth.optional() }), req.query);
  const { from, to } = monthBounds(month);
  const eid = req.user!.employeeId!;
  const [emp] = await db.select().from(schema.employees).where(eq(schema.employees.id, eid));
  const atts = await db.select().from(schema.attendances).where(and(eq(schema.attendances.employeeId, eid), gte(schema.attendances.workDate, from), lte(schema.attendances.workDate, to)));
  const holidays = await loadHolidays();
  const leaves = await loadApprovedLeaves(from, to, [eid]);
  const resolve = await loadScheduleResolver();
  res.json(eachDate(from, to).map((date) => {
    const a = atts.find((x) => x.workDate === date);
    const r = resolve(emp, date);
    const leave = leaves.get(eid, date);
    const holiday = holidays.label(date);
    const working = !!r && isScheduledWorkDay(date, toRules(r.version));
    return { date, dayStatus: a?.dayStatus ?? (holiday ? 'FERIE' : leave ? leave.category : working ? null : 'NON_TRAVAILLE'), state: a?.state ?? null,
      arrivalAt: a?.arrivalAt ?? null, departureAt: a?.departureAt ?? null, lateMinutes: a?.lateMinutes ?? 0, workedMinutes: a?.workedMinutes ?? 0,
      holiday, leave: leave ? { label: leave.label, category: leave.category } : null, isWorkingDay: working && !holiday };
  }));
}));
