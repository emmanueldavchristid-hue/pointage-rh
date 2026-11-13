import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { and, desc, eq, gte, lte, sql, inArray, ilike } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { ah, parse, zDate, zId, pageParams } from '../utils/http.js';
import { badRequest, conflict, notFound, forbidden } from '../utils/errors.js';
import { requireRole, ADMINS, STAFF, assertCanAccessEmployee } from '../middlewares/auth.js';
import { audit } from '../services/audit.js';
import { empBrief } from '../services/dto.js';
import { getSettings } from '../services/settings.js';
import { notifyEmployee } from '../services/notify.js';
import { scopeConds } from './attendance.js';
import { genPassword } from './employees.js';
import { passwordSchema } from './auth.js';
import { env } from '../config/env.js';
import { fmtDate } from '../utils/time.js';

/* ---------------------------------------------------------- heures sup */
export const overtimeRouter = Router();
overtimeRouter.get('/', requireRole(...STAFF), ah(async (req, res) => {
  const q = parse(z.object({ status: z.string().max(40).optional(), from: zDate.optional(), to: zDate.optional(), departmentId: zId.optional(), employeeId: zId.optional() }).passthrough(), req.query);
  const { page, pageSize, offset } = pageParams(req.query);
  const conds = scopeConds(req, q);
  if (q.status) conds.push(inArray(schema.overtimeRecords.status, q.status.split(',') as any));
  if (q.from) conds.push(gte(schema.overtimeRecords.workDate, q.from));
  if (q.to) conds.push(lte(schema.overtimeRecords.workDate, q.to));
  const where = conds.length ? and(...conds) : undefined;
  const base = () => db.select({ o: schema.overtimeRecords, a: schema.attendances, ...empBrief }).from(schema.overtimeRecords)
    .innerJoin(schema.attendances, eq(schema.attendances.id, schema.overtimeRecords.attendanceId))
    .innerJoin(schema.employees, eq(schema.employees.id, schema.overtimeRecords.employeeId))
    .leftJoin(schema.departments, eq(schema.departments.id, schema.employees.departmentId));
  const [agg] = await db.select({ total: sql<number>`count(*)::int`, potential: sql<number>`coalesce(sum(${schema.overtimeRecords.potentialMinutes}),0)::int`,
    validated: sql<number>`coalesce(sum(${schema.overtimeRecords.validatedMinutes}) filter (where ${schema.overtimeRecords.status} = 'VALIDE'),0)::int`,
    pending: sql<number>`count(*) filter (where ${schema.overtimeRecords.status} = 'EN_ATTENTE')::int` })
    .from(schema.overtimeRecords).innerJoin(schema.employees, eq(schema.employees.id, schema.overtimeRecords.employeeId)).where(where);
  const rows = await base().where(where).orderBy(desc(schema.overtimeRecords.workDate)).limit(pageSize).offset(offset);
  res.json({ items: rows.map((r) => ({ ...r.o, employee: { fullName: r.fullName, matricule: r.matricule, departmentName: r.departmentName },
    arrivalAt: r.a.arrivalAt, departureAt: r.a.departureAt, workedMinutes: r.a.workedMinutes, expectedMinutes: r.a.expectedMinutes, presenceMinutes: r.a.presenceMinutes })),
    total: agg.total, page, pageSize, summary: { potentialMinutes: agg.potential, validatedMinutes: agg.validated, pending: agg.pending } });
}));
overtimeRouter.post('/:id/decide', requireRole(...STAFF), ah(async (req, res) => {
  const id = parse(zId, req.params.id);
  const b = parse(z.object({ status: z.enum(['VALIDE', 'REFUSE']), validatedMinutes: z.number().int().min(0).optional(), rateCode: z.string().max(40).optional().nullable(), comment: z.string().max(1000).optional().nullable() }), req.body);
  const [o] = await db.select().from(schema.overtimeRecords).where(eq(schema.overtimeRecords.id, id));
  if (!o) throw notFound();
  await assertCanAccessEmployee(req, o.employeeId);
  if (o.employeeId === req.user!.employeeId) throw forbidden('Vous ne pouvez pas valider vos propres heures supplémentaires.');
  if (o.status !== 'EN_ATTENTE') throw conflict('INVALID_STATUS', 'Ces heures ont déjà été traitées.');
  const minutes = b.status === 'VALIDE' ? (b.validatedMinutes ?? o.potentialMinutes) : 0;
  if (minutes > o.potentialMinutes) throw badRequest('TOO_MANY', 'Les minutes validées ne peuvent pas dépasser les heures potentielles constatées.');
  if (b.rateCode) {
    const s = await getSettings();
    if (!s.overtime.rates.some((r) => r.code === b.rateCode)) throw badRequest('RATE', 'Taux de majoration inconnu (à paramétrer dans les réglages).');
  }
  await db.update(schema.overtimeRecords).set({ status: b.status, validatedMinutes: b.status === 'VALIDE' ? minutes : null, rateCode: b.rateCode ?? null,
    comment: b.comment ?? null, decidedBy: req.user!.id, decidedAt: new Date(), updatedAt: new Date() }).where(eq(schema.overtimeRecords.id, id));
  await audit(req, 'OVERTIME_DECIDED', { entity: 'overtime', entityId: id, before: { status: o.status, potential: o.potentialMinutes }, after: { ...b, validatedMinutes: minutes } });
  await notifyEmployee(o.employeeId, { type: 'HEURES_SUP', title: b.status === 'VALIDE' ? 'Heures supplémentaires validées' : 'Heures supplémentaires non retenues',
    body: `Journée du ${fmtDate(o.workDate)} : ${b.status === 'VALIDE' ? `${minutes} min validées` : 'refusées'}.${b.comment ? ` ${b.comment}` : ''}`, link: '/app/history' });
  res.json({ ok: true });
}));

/* ------------------------------------------------------------- audit */
export const auditRouter = Router();
auditRouter.get('/', requireRole('SUPER_ADMIN'), ah(async (req, res) => {
  const q = parse(z.object({ action: z.string().max(200).optional(), userId: zId.optional(), user: z.string().max(100).optional(), entity: z.string().max(60).optional(),
    from: zDate.optional(), to: zDate.optional() }).passthrough(), req.query);
  const { page, pageSize, offset } = pageParams(req.query);
  const conds: any[] = [];
  if (q.action) conds.push(inArray(schema.auditLogs.action, q.action.split(',')));
  if (q.userId) conds.push(eq(schema.auditLogs.userId, q.userId));
  if (q.user) conds.push(ilike(schema.auditLogs.userLogin, `%${q.user}%`));
  if (q.entity) conds.push(eq(schema.auditLogs.entity, q.entity));
  if (q.from) conds.push(gte(schema.auditLogs.at, new Date(`${q.from}T00:00:00Z`)));
  if (q.to) conds.push(lte(schema.auditLogs.at, new Date(`${q.to}T23:59:59Z`)));
  const where = conds.length ? and(...conds) : undefined;
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(schema.auditLogs).where(where);
  const items = await db.select().from(schema.auditLogs).where(where).orderBy(desc(schema.auditLogs.at)).limit(pageSize).offset(offset);
  const actions = await db.selectDistinct({ a: schema.auditLogs.action }).from(schema.auditLogs).orderBy(schema.auditLogs.action);
  res.json({ items: items.map(({ userAgent, ...i }) => i), total, page, pageSize, actions: actions.map((x) => x.a) });
}));

/* ------------------------------------------------------- utilisateurs */
export const usersRouter = Router();
usersRouter.use(requireRole('SUPER_ADMIN'));
usersRouter.get('/', ah(async (req, res) => {
  const role = req.query.role ? String(req.query.role) : null;
  const rows = await db.select({ u: schema.users, name: sql<string | null>`${schema.employees.firstNames} || ' ' || ${schema.employees.lastName}`, matricule: schema.employees.matricule })
    .from(schema.users).leftJoin(schema.employees, eq(schema.employees.id, schema.users.employeeId))
    .where(role ? eq(schema.users.role, role as any) : undefined).orderBy(schema.users.role, schema.users.login);
  res.json(rows.map(({ u, name, matricule }) => ({ id: u.id, login: u.login, role: u.role, active: u.active, employeeId: u.employeeId, employeeName: u.employeeId ? name : null, matricule,
    lastLoginAt: u.lastLoginAt, lockedUntil: u.lockedUntil && u.lockedUntil > new Date() ? u.lockedUntil : null, mustChangePassword: u.mustChangePassword, createdAt: u.createdAt })));
}));
usersRouter.post('/', ah(async (req, res) => {
  const b = parse(z.object({ login: z.string().trim().min(3).max(160), password: passwordSchema.optional(), role: z.enum(['SUPER_ADMIN', 'HR_ADMIN', 'MANAGER', 'EMPLOYEE']), employeeId: zId.optional().nullable() }), req.body);
  const [dup] = await db.select().from(schema.users).where(sql`lower(${schema.users.login}) = lower(${b.login})`);
  if (dup) throw conflict('DUPLICATE_LOGIN', 'Cet identifiant existe déjà.');
  if (b.employeeId) {
    const [linked] = await db.select().from(schema.users).where(eq(schema.users.employeeId, b.employeeId));
    if (linked) throw conflict('EMPLOYEE_HAS_ACCOUNT', 'Cet employé possède déjà un compte : modifiez son rôle.');
  }
  if ((b.role === 'MANAGER' || b.role === 'EMPLOYEE') && !b.employeeId) throw badRequest('EMPLOYEE_REQUIRED', 'Un compte responsable ou employé doit être rattaché à une fiche employé.');
  const password = b.password ?? genPassword();
  const [u] = await db.insert(schema.users).values({ login: b.login, passwordHash: await bcrypt.hash(password, 12), role: b.role, employeeId: b.employeeId ?? null, mustChangePassword: true }).returning();
  await audit(req, 'USER_CREATED', { entity: 'user', entityId: u.id, after: { login: b.login, role: b.role, employeeId: b.employeeId } });
  res.status(201).json({ id: u.id, login: u.login, role: u.role, initialPassword: password });
}));
usersRouter.put('/:id', ah(async (req, res) => {
  const id = parse(zId, req.params.id);
  const b = parse(z.object({ role: z.enum(['SUPER_ADMIN', 'HR_ADMIN', 'MANAGER', 'EMPLOYEE']).optional(), active: z.boolean().optional(), unlock: z.boolean().optional() }), req.body);
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, id));
  if (!u) throw notFound();
  if (id === req.user!.id && (b.active === false || (b.role && b.role !== 'SUPER_ADMIN'))) throw badRequest('SELF', 'Vous ne pouvez pas retirer vos propres droits.');
  if (u.role === 'SUPER_ADMIN' && (b.active === false || (b.role && b.role !== 'SUPER_ADMIN'))) {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.users).where(and(eq(schema.users.role, 'SUPER_ADMIN'), eq(schema.users.active, true)));
    if (n <= 1) throw badRequest('LAST_SUPER_ADMIN', 'Il doit rester au moins un super administrateur actif.');
  }
  await db.update(schema.users).set({ ...(b.role ? { role: b.role } : {}), ...(b.active !== undefined ? { active: b.active } : {}), ...(b.unlock ? { lockedUntil: null, failedAttempts: 0 } : {}), updatedAt: new Date() })
    .where(eq(schema.users.id, id));
  if (b.active === false || b.role) await db.update(schema.sessions).set({ revokedAt: new Date() }).where(eq(schema.sessions.userId, id));
  await audit(req, 'USER_UPDATED', { entity: 'user', entityId: id, before: { role: u.role, active: u.active }, after: b });
  res.json({ ok: true });
}));

/* ------------------------------------------------------- sauvegardes */
export async function runBackup(trigger: 'AUTO' | 'MANUEL', userId: number | null) {
  fs.mkdirSync(env.BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fileName = `pointage-${stamp}.dump`;
  const file = path.join(env.BACKUP_DIR, fileName);
  const url = new URL(env.DATABASE_URL);
  const result = await new Promise<{ ok: boolean; message: string }>((resolve) => {
    const p = spawn('pg_dump', ['-Fc', '-f', file, '-h', url.hostname, '-p', url.port || '5432', '-U', decodeURIComponent(url.username), url.pathname.slice(1)],
      { env: { ...process.env, PGPASSWORD: decodeURIComponent(url.password) } });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', (e) => resolve({ ok: false, message: `pg_dump indisponible : ${e.message}` }));
    p.on('close', (code) => resolve(code === 0 ? { ok: true, message: 'Sauvegarde réussie' } : { ok: false, message: err.slice(0, 500) || `code ${code}` }));
  });
  const size = result.ok && fs.existsSync(file) ? fs.statSync(file).size : null;
  const [b] = await db.insert(schema.backups).values({ fileName, sizeBytes: size, status: result.ok ? 'OK' : 'ERREUR', trigger, message: result.message, createdBy: userId }).returning();
  if (result.ok) {
    // rotation : conserve les N dernières sauvegardes
    const keep = (await getSettings()).backup.keep;
    const files = fs.readdirSync(env.BACKUP_DIR).filter((f) => f.endsWith('.dump')).sort().reverse();
    for (const f of files.slice(keep)) fs.rmSync(path.join(env.BACKUP_DIR, f), { force: true });
  }
  return b;
}
export const backupsRouter = Router();
backupsRouter.use(requireRole('SUPER_ADMIN'));
backupsRouter.get('/', ah(async (_req, res) => {
  const rows = await db.select().from(schema.backups).orderBy(desc(schema.backups.createdAt)).limit(100);
  res.json(rows.map((r) => ({ ...r, available: r.status === 'OK' && fs.existsSync(path.join(env.BACKUP_DIR, r.fileName)) })));
}));
backupsRouter.post('/', ah(async (req, res) => {
  const b = await runBackup('MANUEL', req.user!.id);
  await audit(req, 'BACKUP_CREATED', { entity: 'backup', entityId: b.id, after: { status: b.status, file: b.fileName } });
  res.status(b.status === 'OK' ? 201 : 500).json(b.status === 'OK' ? b : { error: { code: 'BACKUP_FAILED', message: `Échec de la sauvegarde : ${b.message}` } });
}));
backupsRouter.get('/:id/download', ah(async (req, res) => {
  const id = parse(zId, req.params.id);
  const [b] = await db.select().from(schema.backups).where(eq(schema.backups.id, id));
  const file = b && path.join(env.BACKUP_DIR, path.basename(b.fileName));
  if (!b || !fs.existsSync(file)) throw notFound('Fichier de sauvegarde introuvable');
  await audit(req, 'BACKUP_DOWNLOADED', { entity: 'backup', entityId: id });
  res.download(file);
}));
