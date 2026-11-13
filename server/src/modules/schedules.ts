import { Router, type Request } from 'express';
import { z } from 'zod';
import { and, desc, eq, isNull, or, gte, sql, inArray } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { ah, parse, zDate, zId, zTime } from '../utils/http.js';
import { badRequest, conflict, notFound, forbidden } from '../utils/errors.js';
import { requireRole, ADMINS } from '../middlewares/auth.js';
import { audit } from '../services/audit.js';
import { resolveSchedule } from '../services/schedule.js';
import { companyTz } from '../services/settings.js';
import { addDays, localDate } from '../utils/time.js';

export const router = Router();

export const versionInput = z.object({
  effectiveFrom: zDate, startTime: zTime, endTime: zTime,
  breakStart: zTime.nullable().optional(), breakEnd: zTime.nullable().optional(),
  workDays: z.array(z.number().int().min(1).max(7)).min(1, 'au moins un jour travaillé').max(7),
  dailyMinutes: z.number().int().min(30).max(1440), lateToleranceMin: z.number().int().min(0).max(240),
  earlyLeaveToleranceMin: z.number().int().min(0).max(240).default(0), overtimeThresholdMin: z.number().int().min(0).max(600).default(0),
  breakTracking: z.boolean().default(false), maxBreaks: z.number().int().min(0).max(10).default(1),
  arrivalWindowBeforeMin: z.number().int().min(0).max(720).default(120), note: z.string().max(500).optional(),
}).refine((v) => (!v.breakStart && !v.breakEnd) || (v.breakStart && v.breakEnd), { message: 'début et fin de pause vont ensemble', path: ['breakEnd'] })
  .refine((v) => v.startTime !== v.endTime, { message: 'début et fin identiques', path: ['endTime'] });

/**
 * Crée une nouvelle version datée. Une version déjà entrée en vigueur n'est jamais modifiée :
 * la modification d'une date future remplace la version programmée à cette même date.
 */
export async function createVersion(req: Request, scheduleId: number, v: z.infer<typeof versionInput>, allowPast = false) {
  const tz = await companyTz();
  const today = localDate(new Date(), tz);
  if (v.effectiveFrom < today && !allowPast && req.user!.role !== 'SUPER_ADMIN') {
    throw badRequest('EFFECTIVE_DATE_PAST', "La date d'entrée en vigueur ne peut pas être dans le passé (les présences passées gardent leurs règles).");
  }
  const [existing] = await db.select().from(schema.scheduleVersions).where(and(eq(schema.scheduleVersions.scheduleId, scheduleId), eq(schema.scheduleVersions.effectiveFrom, v.effectiveFrom)));
  const values = { ...v, breakStart: v.breakStart ?? null, breakEnd: v.breakEnd ?? null, scheduleId, createdBy: req.user!.id };
  let version;
  if (existing) {
    const used = await db.select({ id: schema.attendances.id }).from(schema.attendances).where(eq(schema.attendances.scheduleVersionId, existing.id)).limit(1);
    if (used.length) throw conflict('VERSION_IN_USE', 'Cette version est déjà utilisée par des présences enregistrées : choisissez une nouvelle date d\'effet.');
    [version] = await db.update(schema.scheduleVersions).set(values).where(eq(schema.scheduleVersions.id, existing.id)).returning();
  } else {
    [version] = await db.insert(schema.scheduleVersions).values(values).returning();
  }
  await audit(req, 'SCHEDULE_VERSION_SAVED', { entity: 'schedule', entityId: scheduleId, before: existing ?? null, after: version });
  return version;
}

router.get('/', requireRole('SUPER_ADMIN', 'HR_ADMIN', 'MANAGER'), ah(async (_req, res) => {
  const tz = await companyTz();
  const today = localDate(new Date(), tz);
  const scheds = await db.select().from(schema.schedules).orderBy(desc(schema.schedules.isDefault), schema.schedules.name);
  const versions = await db.select().from(schema.scheduleVersions).orderBy(desc(schema.scheduleVersions.effectiveFrom));
  const counts = await db.select({ id: schema.scheduleAssignments.scheduleId, n: sql<number>`count(*)::int` }).from(schema.scheduleAssignments)
    .where(or(isNull(schema.scheduleAssignments.effectiveTo), gte(schema.scheduleAssignments.effectiveTo, today))).groupBy(schema.scheduleAssignments.scheduleId);
  res.json(scheds.map((s) => {
    const vs = versions.filter((v) => v.scheduleId === s.id);
    return { ...s, currentVersion: vs.find((v) => v.effectiveFrom <= today) ?? vs[vs.length - 1] ?? null, upcomingVersion: vs.find((v) => v.effectiveFrom > today) ?? null,
      versions: vs, assignmentsCount: counts.find((c) => c.id === s.id)?.n ?? 0 };
  }));
}));

router.post('/', requireRole(...ADMINS), ah(async (req, res) => {
  const body = parse(z.object({ name: z.string().trim().min(2).max(120), description: z.string().max(500).optional(), isDefault: z.boolean().optional(), version: versionInput }), req.body);
  const [dup] = await db.select().from(schema.schedules).where(eq(schema.schedules.name, body.name));
  if (dup) throw conflict('DUPLICATE', 'Un horaire porte déjà ce nom.');
  const s = await db.transaction(async (tx) => {
    if (body.isDefault) await tx.update(schema.schedules).set({ isDefault: false });
    const [s] = await tx.insert(schema.schedules).values({ name: body.name, description: body.description, isDefault: !!body.isDefault }).returning();
    return s;
  });
  const version = await createVersion(req, s.id, body.version, true);
  await audit(req, 'SCHEDULE_CREATED', { entity: 'schedule', entityId: s.id, after: s });
  res.status(201).json({ ...s, currentVersion: version });
}));

router.put('/:id', requireRole(...ADMINS), ah(async (req, res) => {
  const id = parse(zId, req.params.id);
  const body = parse(z.object({ name: z.string().trim().min(2).max(120).optional(), description: z.string().max(500).optional().nullable(), active: z.boolean().optional(), isDefault: z.boolean().optional() }), req.body);
  const [before] = await db.select().from(schema.schedules).where(eq(schema.schedules.id, id));
  if (!before) throw notFound();
  if (body.active === false && before.isDefault) throw badRequest('DEFAULT_SCHEDULE', "L'horaire par défaut ne peut pas être désactivé.");
  await db.transaction(async (tx) => {
    if (body.isDefault) await tx.update(schema.schedules).set({ isDefault: false });
    await tx.update(schema.schedules).set({ ...body, updatedAt: new Date() }).where(eq(schema.schedules.id, id));
  });
  await audit(req, 'SCHEDULE_UPDATED', { entity: 'schedule', entityId: id, before, after: body });
  res.json({ ok: true });
}));

router.post('/:id/versions', requireRole(...ADMINS), ah(async (req, res) => {
  const id = parse(zId, req.params.id);
  const [s] = await db.select().from(schema.schedules).where(eq(schema.schedules.id, id));
  if (!s) throw notFound();
  res.status(201).json(await createVersion(req, id, parse(versionInput, req.body)));
}));

router.get('/assignments', requireRole('SUPER_ADMIN', 'HR_ADMIN', 'MANAGER'), ah(async (req, res) => {
  const q = parse(z.object({ employeeId: zId.optional(), departmentId: zId.optional() }), req.query);
  const conds = [];
  if (q.employeeId) conds.push(eq(schema.scheduleAssignments.employeeId, q.employeeId));
  if (q.departmentId) conds.push(eq(schema.scheduleAssignments.departmentId, q.departmentId));
  const rows = await db.select({ a: schema.scheduleAssignments, scheduleName: schema.schedules.name,
    employeeName: sql<string | null>`${schema.employees.firstNames} || ' ' || ${schema.employees.lastName}`, departmentName: schema.departments.name })
    .from(schema.scheduleAssignments)
    .innerJoin(schema.schedules, eq(schema.schedules.id, schema.scheduleAssignments.scheduleId))
    .leftJoin(schema.employees, eq(schema.employees.id, schema.scheduleAssignments.employeeId))
    .leftJoin(schema.departments, eq(schema.departments.id, schema.scheduleAssignments.departmentId))
    .where(conds.length ? and(...conds) : undefined).orderBy(desc(schema.scheduleAssignments.effectiveFrom));
  res.json(rows.map((r) => ({ ...r.a, scheduleName: r.scheduleName, employeeName: r.a.employeeId ? r.employeeName : null, departmentName: r.departmentName,
    target: r.a.employeeId ? 'EMPLOYE' : 'DEPARTEMENT' })));
}));

router.post('/assignments', requireRole(...ADMINS), ah(async (req, res) => {
  const b = parse(z.object({ scheduleId: zId, employeeIds: z.array(zId).max(500).optional(), departmentId: zId.optional(), effectiveFrom: zDate, effectiveTo: zDate.optional().nullable() })
    .refine((x) => (x.employeeIds?.length ?? 0) > 0 || x.departmentId, 'cible requise (employés ou département)'), req.body);
  if (b.effectiveTo && b.effectiveTo < b.effectiveFrom) throw badRequest('DATES', 'La date de fin précède la date de début.');
  const [s] = await db.select().from(schema.schedules).where(eq(schema.schedules.id, b.scheduleId));
  if (!s?.active) throw badRequest('SCHEDULE_INACTIVE', 'Horaire introuvable ou inactif.');
  const targets = b.employeeIds?.length ? b.employeeIds.map((employeeId) => ({ employeeId, departmentId: null })) : [{ employeeId: null, departmentId: b.departmentId! }];
  const created = await db.transaction(async (tx) => {
    const out = [];
    for (const t of targets) {
      // clôture les affectations ouvertes de la même cible qui chevauchent la nouvelle date d'effet
      const cond = t.employeeId ? eq(schema.scheduleAssignments.employeeId, t.employeeId) : and(eq(schema.scheduleAssignments.departmentId, t.departmentId!), isNull(schema.scheduleAssignments.employeeId));
      await tx.update(schema.scheduleAssignments).set({ effectiveTo: addDays(b.effectiveFrom, -1) })
        .where(and(cond, sql`${schema.scheduleAssignments.effectiveFrom} < ${b.effectiveFrom}`, or(isNull(schema.scheduleAssignments.effectiveTo), gte(schema.scheduleAssignments.effectiveTo, b.effectiveFrom))));
      const [a] = await tx.insert(schema.scheduleAssignments).values({ scheduleId: b.scheduleId, ...t, effectiveFrom: b.effectiveFrom, effectiveTo: b.effectiveTo ?? null, createdBy: req.user!.id }).returning();
      out.push(a);
    }
    return out;
  });
  await audit(req, 'SCHEDULE_ASSIGNED', { entity: 'schedule', entityId: b.scheduleId, after: created });
  res.status(201).json(created);
}));

router.delete('/assignments/:id', requireRole(...ADMINS), ah(async (req, res) => {
  const id = parse(zId, req.params.id);
  const [a] = await db.select().from(schema.scheduleAssignments).where(eq(schema.scheduleAssignments.id, id));
  if (!a) throw notFound();
  const today = localDate(new Date(), await companyTz());
  // on ne supprime pas l'historique : on clôture l'affectation (ou on retire une affectation future jamais appliquée)
  if (a.effectiveFrom > today) await db.delete(schema.scheduleAssignments).where(eq(schema.scheduleAssignments.id, id));
  else await db.update(schema.scheduleAssignments).set({ effectiveTo: addDays(today, -1) < a.effectiveFrom ? a.effectiveFrom : addDays(today, -1) }).where(eq(schema.scheduleAssignments.id, id));
  await audit(req, 'SCHEDULE_UNASSIGNED', { entity: 'schedule_assignment', entityId: id, before: a });
  res.json({ ok: true });
}));

router.get('/resolve', requireRole('SUPER_ADMIN', 'HR_ADMIN', 'MANAGER'), ah(async (req, res) => {
  const q = parse(z.object({ employeeId: zId, date: zDate }), req.query);
  const r = await resolveSchedule(q.employeeId, q.date);
  res.json(r ? { source: r.source, schedule: { id: r.scheduleId, name: r.scheduleName }, version: r.version } : null);
}));

/* ---- Jours fériés ---- */
export const holidaysRouter = Router();
holidaysRouter.get('/', ah(async (_req, res) => res.json(await db.select().from(schema.holidays).orderBy(schema.holidays.date))));
holidaysRouter.post('/', requireRole(...ADMINS), ah(async (req, res) => {
  const b = parse(z.object({ date: zDate, label: z.string().trim().min(2).max(120), recurring: z.boolean().default(false) }), req.body);
  const [dup] = await db.select().from(schema.holidays).where(eq(schema.holidays.date, b.date));
  if (dup) throw conflict('DUPLICATE', 'Un jour férié existe déjà à cette date.');
  const [h] = await db.insert(schema.holidays).values(b).returning();
  await audit(req, 'HOLIDAY_CREATED', { entity: 'holiday', entityId: h.id, after: h });
  res.status(201).json(h);
}));
holidaysRouter.delete('/:id', requireRole(...ADMINS), ah(async (req, res) => {
  const id = parse(zId, req.params.id);
  const [h] = await db.delete(schema.holidays).where(eq(schema.holidays.id, id)).returning();
  if (!h) throw notFound();
  await audit(req, 'HOLIDAY_DELETED', { entity: 'holiday', entityId: id, before: h });
  res.json({ ok: true });
}));
export { inArray, forbidden };
