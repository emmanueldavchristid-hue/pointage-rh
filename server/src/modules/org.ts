import { Router } from 'express';
import { z } from 'zod';
import { eq, sql, and } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { ah, parse, zId } from '../utils/http.js';
import { conflict, notFound } from '../utils/errors.js';
import { requireRole, ADMINS, STAFF } from '../middlewares/auth.js';
import { audit } from '../services/audit.js';

export const departmentsRouter = Router();
const depInput = z.object({ name: z.string().trim().min(2).max(120), code: z.string().trim().min(1).max(20).transform((s) => s.toUpperCase()),
  description: z.string().max(500).optional().nullable(), managerEmployeeId: zId.optional().nullable(), active: z.boolean().optional() });

departmentsRouter.get('/', requireRole(...STAFF), ah(async (_req, res) => {
  const rows = await db.select({ d: schema.departments, count: sql<number>`(SELECT count(*)::int FROM employees e WHERE e.department_id = ${schema.departments.id} AND e.status = 'ACTIVE')`,
    managerName: sql<string | null>`(SELECT first_names || ' ' || last_name FROM employees m WHERE m.id = ${schema.departments.managerEmployeeId})` })
    .from(schema.departments).orderBy(schema.departments.name);
  res.json(rows.map((r) => ({ ...r.d, employeesCount: r.count, managerName: r.managerName })));
}));
departmentsRouter.post('/', requireRole(...ADMINS), ah(async (req, res) => {
  const b = parse(depInput, req.body);
  const [dup] = await db.select().from(schema.departments).where(eq(schema.departments.code, b.code));
  if (dup) throw conflict('DUPLICATE', 'Ce code de département existe déjà.');
  const [d] = await db.insert(schema.departments).values(b).returning();
  await audit(req, 'DEPARTMENT_CREATED', { entity: 'department', entityId: d.id, after: d });
  res.status(201).json(d);
}));
departmentsRouter.put('/:id', requireRole(...ADMINS), ah(async (req, res) => {
  const id = parse(zId, req.params.id);
  const b = parse(depInput.partial(), req.body);
  const [before] = await db.select().from(schema.departments).where(eq(schema.departments.id, id));
  if (!before) throw notFound();
  const [d] = await db.update(schema.departments).set({ ...b, updatedAt: new Date() }).where(eq(schema.departments.id, id)).returning();
  await audit(req, 'DEPARTMENT_UPDATED', { entity: 'department', entityId: id, before, after: d });
  res.json(d);
}));
departmentsRouter.delete('/:id', requireRole(...ADMINS), ah(async (req, res) => {
  const id = parse(zId, req.params.id);
  const [d] = await db.update(schema.departments).set({ active: false, updatedAt: new Date() }).where(eq(schema.departments.id, id)).returning();
  if (!d) throw notFound();
  await audit(req, 'DEPARTMENT_DEACTIVATED', { entity: 'department', entityId: id });
  res.json({ ok: true });
}));

export const positionsRouter = Router();
positionsRouter.get('/', requireRole(...STAFF), ah(async (_req, res) => {
  res.json(await db.select({ id: schema.positions.id, title: schema.positions.title, departmentId: schema.positions.departmentId, departmentName: schema.departments.name })
    .from(schema.positions).leftJoin(schema.departments, eq(schema.departments.id, schema.positions.departmentId)).orderBy(schema.positions.title));
}));
const posInput = z.object({ title: z.string().trim().min(2).max(120), departmentId: zId.optional().nullable() });
positionsRouter.post('/', requireRole(...ADMINS), ah(async (req, res) => {
  const b = parse(posInput, req.body);
  const [p] = await db.insert(schema.positions).values(b).onConflictDoNothing().returning();
  if (!p) throw conflict('DUPLICATE', 'Ce poste existe déjà.');
  await audit(req, 'POSITION_CREATED', { entity: 'position', entityId: p.id, after: p });
  res.status(201).json(p);
}));
positionsRouter.put('/:id', requireRole(...ADMINS), ah(async (req, res) => {
  const id = parse(zId, req.params.id);
  const [p] = await db.update(schema.positions).set({ ...parse(posInput.partial(), req.body), updatedAt: new Date() }).where(eq(schema.positions.id, id)).returning();
  if (!p) throw notFound();
  res.json(p);
}));
export { and };
