import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { env } from '../config/env.js';
import { forbidden, unauthorized } from '../utils/errors.js';

export type Role = 'SUPER_ADMIN' | 'HR_ADMIN' | 'MANAGER' | 'EMPLOYEE';
export interface AuthUser {
  id: number; login: string; role: Role; employeeId: number | null; departmentId: number | null;
  sessionId: string; mustChangePassword: boolean;
}
declare global { namespace Express { interface Request { user?: AuthUser } } }

export const COOKIE = 'sid';

export function cookieOptions(req: Request, maxAgeMs: number) {
  const secure = env.COOKIE_SECURE === 'auto' ? req.secure : env.COOKIE_SECURE === 'true';
  return { httpOnly: true, secure, sameSite: 'strict' as const, path: '/', maxAge: maxAgeMs };
}

export async function loadUser(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = req.cookies?.[COOKIE];
    if (!token) return next();
    let payload: any;
    try { payload = jwt.verify(token, env.JWT_SECRET); } catch { return next(); }
    const rows = await db.select({
      s: schema.sessions, u: schema.users, e: schema.employees,
    }).from(schema.sessions)
      .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
      .leftJoin(schema.employees, eq(schema.employees.id, schema.users.employeeId))
      .where(and(eq(schema.sessions.id, payload.sid), isNull(schema.sessions.revokedAt), gt(schema.sessions.expiresAt, new Date())));
    const row = rows[0];
    if (!row || !row.u.active || (row.e && row.e.status !== 'ACTIVE')) return next();
    req.user = {
      id: row.u.id, login: row.u.login, role: row.u.role, employeeId: row.u.employeeId,
      departmentId: row.e?.departmentId ?? null, sessionId: row.s.id, mustChangePassword: row.u.mustChangePassword,
    };
    // mise à jour « dernière activité » au plus toutes les 5 minutes
    if (Date.now() - row.s.lastSeenAt.getTime() > 300_000) {
      db.update(schema.sessions).set({ lastSeenAt: new Date() }).where(eq(schema.sessions.id, row.s.id)).catch(() => {});
    }
    next();
  } catch (e) { next(e); }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(unauthorized());
  // Changement de mot de passe obligatoire : seules les routes d'auth restent accessibles
  if (req.user.mustChangePassword && !req.originalUrl.startsWith('/api/auth')) {
    return next(Object.assign(forbidden('Vous devez changer votre mot de passe avant de continuer.'), { code: 'PASSWORD_CHANGE_REQUIRED' }));
  }
  next();
}

export const requireRole = (...roles: Role[]) => (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) return next(unauthorized());
  if (!roles.includes(req.user.role)) return next(forbidden());
  next();
};

export const ADMINS: Role[] = ['SUPER_ADMIN', 'HR_ADMIN'];
export const STAFF: Role[] = ['SUPER_ADMIN', 'HR_ADMIN', 'MANAGER'];

/**
 * Périmètre de données : un MANAGER ne voit que son département.
 * Renvoie l'id de département imposé (ou null = pas de restriction).
 */
export function departmentScope(req: Request): number | null | 'NONE' {
  const u = req.user!;
  if (u.role === 'MANAGER') return u.departmentId ?? 'NONE';
  return null;
}

/** Vérifie qu'un utilisateur peut accéder aux données d'un employé donné */
export async function assertCanAccessEmployee(req: Request, employeeId: number) {
  const u = req.user!;
  if (u.role === 'SUPER_ADMIN' || u.role === 'HR_ADMIN') return;
  if (u.employeeId === employeeId) return;
  if (u.role === 'MANAGER') {
    const [e] = await db.select({ d: schema.employees.departmentId }).from(schema.employees).where(eq(schema.employees.id, employeeId));
    if (e && u.departmentId && e.d === u.departmentId) return;
  }
  throw forbidden("Accès refusé : cet employé n'appartient pas à votre périmètre.");
}

/** Permissions exposées au frontend (et seedées dans role_permissions) */
export const PERMISSIONS: Record<Role, string[]> = {
  SUPER_ADMIN: ['*'],
  HR_ADMIN: ['employees.manage', 'attendance.view', 'attendance.correct', 'absences.manage', 'leaves.decide', 'justifications.review',
    'overtime.decide', 'reports.view', 'reports.export', 'anomalies.manage', 'schedules.manage', 'holidays.manage', 'dashboard.view', 'kiosk.badge'],
  MANAGER: ['team.view', 'attendance.view', 'leaves.review', 'overtime.review', 'reports.view', 'dashboard.view', 'anomalies.view'],
  EMPLOYEE: ['self.clock', 'self.view', 'self.requests'],
};
