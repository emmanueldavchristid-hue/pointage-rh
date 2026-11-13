import { Router } from 'express';
import { z } from 'zod';
import { DateTime } from 'luxon';
import { and, eq, gte, lte, sql, inArray } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { ah, parse, zDate, zId } from '../utils/http.js';
import { requireRole, STAFF } from '../middlewares/auth.js';
import { liveBoard, scopeConds } from './attendance.js';
import { companyTz } from '../services/settings.js';
import { addDays, localDate } from '../utils/time.js';

export const router = Router();
router.use(requireRole(...STAFF));

router.get('/kpis', ah(async (req, res) => {
  const q = parse(z.object({ date: zDate.optional(), departmentId: zId.optional() }), req.query);
  const tz = await companyTz();
  const date = q.date ?? localDate(new Date(), tz);
  const live = await liveBoard(req, date, q.departmentId);
  const sc = scopeConds(req, { departmentId: q.departmentId });
  const empJoin = <T extends { employeeId: any }>(t: T) => eq(schema.employees.id, t.employeeId);
  const [ot] = await db.select({ n: sql<number>`count(*)::int`, m: sql<number>`coalesce(sum(${schema.overtimeRecords.potentialMinutes}),0)::int` }).from(schema.overtimeRecords)
    .innerJoin(schema.employees, empJoin(schema.overtimeRecords)).where(and(eq(schema.overtimeRecords.status, 'EN_ATTENTE'), ...sc));
  const [an] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.anomalies).innerJoin(schema.employees, empJoin(schema.anomalies))
    .where(and(inArray(schema.anomalies.status, ['OUVERTE', 'EN_COURS']), ...sc));
  const [lv] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.leaveRequests).innerJoin(schema.employees, empJoin(schema.leaveRequests))
    .where(and(eq(schema.leaveRequests.status, 'EN_ATTENTE'), ...sc));
  const [inc] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.attendances).innerJoin(schema.employees, empJoin(schema.attendances))
    .where(and(eq(schema.attendances.state, 'POINTAGE_INCOMPLET'), eq(schema.attendances.corrected, false), ...sc));
  const c = live.counts;
  const expected = c.present + c.notArrived + c.absent;
  res.json({
    date, activeEmployees: c.active, scheduledToday: c.scheduled, presentToday: c.present, absentToday: c.absent + c.notArrived, notArrivedYet: c.notArrived,
    confirmedAbsent: c.absent, lateToday: c.late, earlyLeaveToday: c.earlyLeave, onBreak: c.onBreak, onLeave: c.onLeave,
    presenceRate: expected ? Math.round((c.present / expected) * 1000) / 10 : null,
    incomplete: inc.n, incompleteToday: c.incomplete, overtimePending: ot.n, overtimePendingMinutes: ot.m, openAnomalies: an.n, pendingLeaves: lv.n, holiday: live.holiday,
  });
}));

router.get('/charts', ah(async (req, res) => {
  const tz = await companyTz();
  const today = localDate(new Date(), tz);
  const q = parse(z.object({ from: zDate.optional(), to: zDate.optional(), departmentId: zId.optional() }), req.query);
  const to = q.to ?? today; const from = q.from ?? addDays(to, -29);
  const sc = scopeConds(req, { departmentId: q.departmentId });
  const period = and(gte(schema.attendances.workDate, from), lte(schema.attendances.workDate, to), ...sc);
  const A = schema.attendances;
  const base = () => db.select().from(A);
  void base;
  const daily = await db.select({
    date: A.workDate,
    onTime: sql<number>`count(*) filter (where ${A.arrivalAt} is not null and ${A.lateMinutes} = 0)::int`,
    late: sql<number>`count(*) filter (where ${A.lateMinutes} > 0)::int`,
    absent: sql<number>`count(*) filter (where ${A.dayStatus} in ('ABSENCE_NON_JUSTIFIEE','ABSENCE_JUSTIFIEE'))::int`,
    leave: sql<number>`count(*) filter (where ${A.dayStatus} in ('CONGE','PERMISSION','MISSION'))::int`,
    expected: sql<number>`count(*) filter (where ${A.arrivalAt} is not null or ${A.dayStatus} in ('ABSENCE_NON_JUSTIFIEE','ABSENCE_JUSTIFIEE'))::int`,
  }).from(A).innerJoin(schema.employees, eq(schema.employees.id, A.employeeId)).where(period).groupBy(A.workDate).orderBy(A.workDate);

  const sixMonthsAgo = DateTime.fromISO(to).minus({ months: 5 }).startOf('month').toISODate()!;
  const monthly = await db.select({ month: sql<string>`to_char(${A.workDate}::date, 'YYYY-MM')`, count: sql<number>`count(*) filter (where ${A.lateMinutes} > 0)::int`,
    minutes: sql<number>`coalesce(sum(${A.lateMinutes}),0)::int` })
    .from(A).innerJoin(schema.employees, eq(schema.employees.id, A.employeeId)).where(and(gte(A.workDate, sixMonthsAgo), lte(A.workDate, to), ...sc))
    .groupBy(sql`1`).orderBy(sql`1`);

  const breakdown = await db.select({ status: A.dayStatus, count: sql<number>`count(*)::int` }).from(A).innerJoin(schema.employees, eq(schema.employees.id, A.employeeId))
    .where(and(period, inArray(A.dayStatus, ['ABSENCE_NON_JUSTIFIEE', 'ABSENCE_JUSTIFIEE', 'CONGE', 'PERMISSION', 'MISSION']))).groupBy(A.dayStatus);

  const byDep = await db.select({ department: sql<string>`coalesce(${schema.departments.name}, 'Sans département')`,
    present: sql<number>`count(*) filter (where ${A.arrivalAt} is not null)::int`,
    absent: sql<number>`count(*) filter (where ${A.dayStatus} in ('ABSENCE_NON_JUSTIFIEE','ABSENCE_JUSTIFIEE'))::int`,
    late: sql<number>`count(*) filter (where ${A.lateMinutes} > 0)::int` })
    .from(A).innerJoin(schema.employees, eq(schema.employees.id, A.employeeId)).leftJoin(schema.departments, eq(schema.departments.id, schema.employees.departmentId))
    .where(period).groupBy(sql`1`).orderBy(sql`1`);

  const O = schema.overtimeRecords;
  const otDep = await db.select({ department: sql<string>`coalesce(${schema.departments.name}, 'Sans département')`,
    potentialMinutes: sql<number>`coalesce(sum(${O.potentialMinutes}),0)::int`, validatedMinutes: sql<number>`coalesce(sum(${O.validatedMinutes}) filter (where ${O.status} = 'VALIDE'),0)::int`,
    pendingMinutes: sql<number>`coalesce(sum(${O.potentialMinutes}) filter (where ${O.status} = 'EN_ATTENTE'),0)::int` })
    .from(O).innerJoin(schema.employees, eq(schema.employees.id, O.employeeId)).leftJoin(schema.departments, eq(schema.departments.id, schema.employees.departmentId))
    .where(and(gte(O.workDate, from), lte(O.workDate, to), ...sc)).groupBy(sql`1`).orderBy(sql`1`);

  res.json({
    period: { from, to },
    presenceDaily: daily.map((d) => ({ date: d.date, present: d.onTime + d.late, onTime: d.onTime, late: d.late, absent: d.absent, leave: d.leave })),
    lateMonthly: monthly,
    absenceBreakdown: breakdown,
    presenceByDepartment: byDep.map((d) => ({ ...d, rate: d.present + d.absent ? Math.round((d.present / (d.present + d.absent)) * 1000) / 10 : null })),
    overtimeByDepartment: otDep,
    presenceRateTrend: daily.map((d) => ({ date: d.date, rate: d.expected ? Math.round(((d.onTime + d.late) / d.expected) * 1000) / 10 : null })),
  });
}));
