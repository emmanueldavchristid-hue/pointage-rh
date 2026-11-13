import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { eq, or, sql, and, ne } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { ah, parse } from '../utils/http.js';
import { AppError, badRequest, unauthorized } from '../utils/errors.js';
import { COOKIE, cookieOptions, requireAuth, PERMISSIONS } from '../middlewares/auth.js';
import { getSettings, getCompany } from '../services/settings.js';
import { audit } from '../services/audit.js';
import { env } from '../config/env.js';
import { fileUrl } from '../services/dto.js';

export const router = Router();

const loginLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: true, legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: { code: 'TOO_MANY_ATTEMPTS', message: 'Trop de tentatives. Réessayez dans une minute.' } }) });

export const passwordSchema = z.string().min(8, '8 caractères minimum').max(128)
  .regex(/[A-Za-z]/, 'au moins une lettre').regex(/\d/, 'au moins un chiffre');

export async function userPayload(userId: number) {
  const [r] = await db.select({ u: schema.users, e: schema.employees, dep: schema.departments.name, pos: schema.positions.title })
    .from(schema.users)
    .leftJoin(schema.employees, eq(schema.employees.id, schema.users.employeeId))
    .leftJoin(schema.departments, eq(schema.departments.id, schema.employees.departmentId))
    .leftJoin(schema.positions, eq(schema.positions.id, schema.employees.positionId))
    .where(eq(schema.users.id, userId));
  return {
    id: r.u.id, login: r.u.login, role: r.u.role, mustChangePassword: r.u.mustChangePassword,
    employee: r.e ? {
      id: r.e.id, matricule: r.e.matricule, firstNames: r.e.firstNames, lastName: r.e.lastName, photoUrl: fileUrl(r.e.photoPath),
      departmentId: r.e.departmentId, departmentName: r.dep, positionTitle: r.pos,
    } : null,
  };
}

export async function companyPayload() {
  const c = await getCompany();
  return c ? { id: c.id, name: c.name, logoUrl: fileUrl(c.logoPath), timezone: c.timezone, currency: c.currency,
    setupCompleted: c.setupCompleted, clockingEnabled: c.clockingEnabled } : null;
}

router.post('/login', loginLimiter, ah(async (req, res) => {
  const { login, password } = parse(z.object({ login: z.string().trim().min(1).max(160), password: z.string().min(1).max(200) }), req.body);
  const settings = await getSettings();
  // connexion par email/login OU par matricule de l'employé lié
  const rows = await db.select({ u: schema.users, e: schema.employees }).from(schema.users)
    .leftJoin(schema.employees, eq(schema.employees.id, schema.users.employeeId))
    .where(or(sql`lower(${schema.users.login}) = lower(${login})`, sql`lower(${schema.employees.matricule}) = lower(${login})`, sql`lower(${schema.employees.email}) = lower(${login})`));
  const row = rows[0];
  const fail = async (reason: string) => {
    await audit(req, 'LOGIN_FAILED', { entity: 'user', entityId: row?.u.id, userId: row?.u.id ?? null, userLogin: login, reason });
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Identifiant ou mot de passe incorrect.');
  };
  if (!row) { await bcrypt.compare(password, '$2a$12$abcdefghijklmnopqrstuuF0Lw7S2l6xSr7fJ1Fc6uSxSNUt8yPHi'); return fail('inconnu'); }
  const u = row.u;
  if (u.lockedUntil && u.lockedUntil > new Date()) {
    const min = Math.ceil((u.lockedUntil.getTime() - Date.now()) / 60000);
    await audit(req, 'LOGIN_LOCKED', { entity: 'user', entityId: u.id, userId: u.id, userLogin: u.login });
    throw new AppError(423, 'ACCOUNT_LOCKED', `Compte temporairement bloqué après plusieurs tentatives incorrectes. Réessayez dans ${min} min.`);
  }
  const ok = await bcrypt.compare(password, u.passwordHash);
  if (!ok) {
    const attempts = u.failedAttempts + 1;
    const lock = attempts >= settings.security.maxLoginAttempts;
    await db.update(schema.users).set({ failedAttempts: lock ? 0 : attempts, lockedUntil: lock ? new Date(Date.now() + settings.security.lockMinutes * 60000) : null })
      .where(eq(schema.users.id, u.id));
    if (lock) {
      await audit(req, 'ACCOUNT_LOCKED', { entity: 'user', entityId: u.id, userId: u.id, userLogin: u.login });
      throw new AppError(423, 'ACCOUNT_LOCKED', `Trop de tentatives incorrectes : compte bloqué ${settings.security.lockMinutes} minutes.`);
    }
    return fail('mot de passe');
  }
  if (!u.active || (row.e && row.e.status !== 'ACTIVE')) {
    await audit(req, 'LOGIN_FAILED', { entity: 'user', entityId: u.id, userId: u.id, userLogin: u.login, reason: 'compte désactivé' });
    throw new AppError(403, 'ACCOUNT_DISABLED', 'Ce compte est désactivé. Contactez les ressources humaines.');
  }
  const sid = crypto.randomBytes(24).toString('hex');
  const ms = settings.security.sessionHours * 3600_000;
  await db.insert(schema.sessions).values({ id: sid, userId: u.id, ip: req.ip, userAgent: req.get('user-agent') ?? null,
    deviceId: (req.get('x-device-id') || '').slice(0, 64) || null, expiresAt: new Date(Date.now() + ms) });
  await db.update(schema.users).set({ failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() }).where(eq(schema.users.id, u.id));
  const token = jwt.sign({ sid }, env.JWT_SECRET, { expiresIn: Math.floor(ms / 1000) });
  res.cookie(COOKIE, token, cookieOptions(req, ms));
  await audit(req, 'LOGIN', { entity: 'user', entityId: u.id, userId: u.id, userLogin: u.login });
  res.json({ user: await userPayload(u.id) });
}));

router.post('/logout', ah(async (req, res) => {
  if (req.user) {
    await db.update(schema.sessions).set({ revokedAt: new Date() }).where(eq(schema.sessions.id, req.user.sessionId));
    await audit(req, 'LOGOUT', { entity: 'user', entityId: req.user.id });
  }
  res.clearCookie(COOKIE, { path: '/' });
  res.json({ ok: true });
}));

router.get('/me', requireAuth, ah(async (req, res) => {
  res.json({ user: await userPayload(req.user!.id), company: await companyPayload(), permissions: PERMISSIONS[req.user!.role] });
}));

router.post('/change-password', ah(async (req, res) => {
  if (!req.user) throw unauthorized();
  const { currentPassword, newPassword } = parse(z.object({ currentPassword: z.string().min(1), newPassword: passwordSchema }), req.body);
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, req.user.id));
  if (!(await bcrypt.compare(currentPassword, u.passwordHash))) throw badRequest('INVALID_PASSWORD', 'Le mot de passe actuel est incorrect.');
  if (currentPassword === newPassword) throw badRequest('SAME_PASSWORD', "Le nouveau mot de passe doit être différent de l'actuel.");
  await db.update(schema.users).set({ passwordHash: await bcrypt.hash(newPassword, 12), mustChangePassword: false, passwordChangedAt: new Date() })
    .where(eq(schema.users.id, u.id));
  // révoque les autres sessions
  await db.update(schema.sessions).set({ revokedAt: new Date() }).where(and(eq(schema.sessions.userId, u.id), ne(schema.sessions.id, req.user.sessionId)));
  await audit(req, 'PASSWORD_CHANGED', { entity: 'user', entityId: u.id });
  res.json({ ok: true });
}));
