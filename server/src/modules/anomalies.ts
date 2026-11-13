import { Router } from 'express';
import { z } from 'zod';
import { and, desc, eq, gte, lte, sql, inArray } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { ah, parse, zDate, zId, pageParams } from '../utils/http.js';
import { notFound } from '../utils/errors.js';
import { requireRole, ADMINS, STAFF, assertCanAccessEmployee } from '../middlewares/auth.js';
import { audit } from '../services/audit.js';
import { empBrief } from '../services/dto.js';
import { scopeConds } from './attendance.js';
import { closeDays } from '../services/attendance.js';

export const router = Router();
router.get('/', requireRole(...STAFF), ah(async (req, res) => {
  const q = parse(z.object({ status: z.string().max(60).optional(), type: z.string().max(200).optional(), severity: z.string().max(60).optional(),
    from: zDate.optional(), to: zDate.optional(), departmentId: zId.optional(), employeeId: zId.optional() }).passthrough(), req.query);
  const { page, pageSize, offset } = pageParams(req.query);
  const conds = scopeConds(req, q);
  if (q.status) conds.push(inArray(schema.anomalies.status, q.status.split(',') as any));
  if (q.type) conds.push(inArray(schema.anomalies.type, q.type.split(',') as any));
  if (q.severity) conds.push(inArray(schema.anomalies.severity, q.severity.split(',') as any));
  if (q.from) conds.push(gte(schema.anomalies.workDate, q.from));
  if (q.to) conds.push(lte(schema.anomalies.workDate, q.to));
  const where = conds.length ? and(...conds) : undefined;
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(schema.anomalies).innerJoin(schema.employees, eq(schema.employees.id, schema.anomalies.employeeId)).where(where);
  const rows = await db.select({ x: schema.anomalies, ...empBrief }).from(schema.anomalies)
    .innerJoin(schema.employees, eq(schema.employees.id, schema.anomalies.employeeId))
    .leftJoin(schema.departments, eq(schema.departments.id, schema.employees.departmentId))
    .where(where).orderBy(desc(schema.anomalies.workDate), desc(schema.anomalies.detectedAt)).limit(pageSize).offset(offset);
  const [counts] = await db.select({ open: sql<number>`count(*) filter (where ${schema.anomalies.status} in ('OUVERTE','EN_COURS'))::int`,
    high: sql<number>`count(*) filter (where ${schema.anomalies.status} in ('OUVERTE','EN_COURS') and ${schema.anomalies.severity} in ('ELEVEE','CRITIQUE'))::int` })
    .from(schema.anomalies).innerJoin(schema.employees, eq(schema.employees.id, schema.anomalies.employeeId)).where(scopeConds(req, {}).length ? and(...scopeConds(req, {})) : undefined);
  res.json({ items: rows.map((r) => ({ ...r.x, employee: { fullName: r.fullName, matricule: r.matricule, departmentName: r.departmentName } })), total, page, pageSize, counts });
}));
router.post('/run-detection', requireRole(...ADMINS), ah(async (req, res) => {
  const { date } = parse(z.object({ date: zDate.optional() }), req.body ?? {});
  const r = await closeDays(date ? { date } : { daysBack: 7 });
  await audit(req, 'ANOMALY_DETECTION_RUN', { after: r });
  res.json(r);
}));
router.post('/:id/resolve', requireRole(...STAFF), ah(async (req, res) => {
  const id = parse(zId, req.params.id);
  const b = parse(z.object({ status: z.enum(['RESOLUE', 'IGNOREE', 'EN_COURS']), note: z.string().trim().min(3, 'note obligatoire').max(1000) }), req.body);
  const [a] = await db.select().from(schema.anomalies).where(eq(schema.anomalies.id, id));
  if (!a) throw notFound();
  await assertCanAccessEmployee(req, a.employeeId);
  const done = b.status !== 'EN_COURS';
  await db.update(schema.anomalies).set({ status: b.status, resolutionNote: b.note, resolvedBy: done ? req.user!.id : null, resolvedAt: done ? new Date() : null }).where(eq(schema.anomalies.id, id));
  await audit(req, 'ANOMALY_TREATED', { entity: 'anomaly', entityId: id, before: { status: a.status }, after: b, reason: b.note });
  res.json({ ok: true });
}));

export const absencesRouter = Router();
absencesRouter.get('/', requireRole(...STAFF), ah(async (req, res) => {
  const q = parse(z.object({ from: zDate.optional(), to: zDate.optional(), departmentId: zId.optional(), employeeId: zId.optional(), dayStatus: z.string().max(200).optional() }).passthrough(), req.query);
  const { page, pageSize, offset } = pageParams(req.query);
  const statuses = (q.dayStatus ? q.dayStatus.split(',') : ['ABSENCE_NON_JUSTIFIEE', 'ABSENCE_JUSTIFIEE', 'CONGE', 'PERMISSION', 'MISSION']) as any[];
  const conds = [...scopeConds(req, q), inArray(schema.attendances.dayStatus, statuses)];
  if (q.from) conds.push(gte(schema.attendances.workDate, q.from));
  if (q.to) conds.push(lte(schema.attendances.workDate, q.to));
  const where = and(...conds);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(schema.attendances).innerJoin(schema.employees, eq(schema.employees.id, schema.attendances.employeeId)).where(where);
  const rows = await db.select({ a: schema.attendances, ...empBrief, j: schema.justifications }).from(schema.attendances)
    .innerJoin(schema.employees, eq(schema.employees.id, schema.attendances.employeeId))
    .leftJoin(schema.departments, eq(schema.departments.id, schema.employees.departmentId))
    .leftJoin(schema.justifications, eq(schema.justifications.id, schema.attendances.justificationId))
    .where(where).orderBy(desc(schema.attendances.workDate)).limit(pageSize).offset(offset);
  const [summary] = await db.select({
    unjustified: sql<number>`count(*) filter (where ${schema.attendances.dayStatus} = 'ABSENCE_NON_JUSTIFIEE')::int`,
    justified: sql<number>`count(*) filter (where ${schema.attendances.dayStatus} = 'ABSENCE_JUSTIFIEE')::int`,
    leave: sql<number>`count(*) filter (where ${schema.attendances.dayStatus} in ('CONGE','PERMISSION'))::int`,
    mission: sql<number>`count(*) filter (where ${schema.attendances.dayStatus} = 'MISSION')::int`,
  }).from(schema.attendances).innerJoin(schema.employees, eq(schema.employees.id, schema.attendances.employeeId)).where(where);
  const { attendanceDto } = await import('./attendance.js');
  res.json({ items: rows.map((r) => ({ ...attendanceDto(r), justification: r.j ? { id: r.j.id, status: r.j.status, reason: r.j.reason, fileName: r.j.fileName, hasFile: !!r.j.filePath } : null })), total, page, pageSize, summary });
}));
