import type { Request, Response, NextFunction, RequestHandler } from 'express';
import { z, ZodTypeAny } from 'zod';
import { AppError } from './errors.js';

export const ah = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { fn(req, res, next).catch(next); };

export function parse<T extends ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const r = schema.safeParse(data);
  if (!r.success) {
    const first = r.error.issues[0];
    throw new AppError(422, 'VALIDATION_ERROR', `Donnée invalide : ${first.path.join('.') || 'requête'} — ${first.message}`, r.error.issues);
  }
  return r.data;
}

export const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'format AAAA-MM-JJ attendu');
export const zTime = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'format HH:mm attendu');
export const zId = z.coerce.number().int().positive();
export const zReason = z.string().trim().min(5, 'motif obligatoire (5 caractères minimum)').max(1000);

export function pageParams(q: any) {
  const page = Math.max(1, Number(q.page) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(q.pageSize) || 25));
  return { page, pageSize, offset: (page - 1) * pageSize };
}
