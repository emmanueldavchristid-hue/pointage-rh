import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import path from 'node:path';
import fs from 'node:fs';
import { env } from './config/env.js';
import { loadUser, requireAuth, requireRole } from './middlewares/auth.js';
import { AppError } from './utils/errors.js';
import { pool } from './db/index.js';
import { router as auth } from './modules/auth.js';
import { router as setup } from './modules/setup.js';
import { router as settings } from './modules/settings.js';
import { departmentsRouter, positionsRouter } from './modules/org.js';
import { router as employees } from './modules/employees.js';
import { router as schedules, holidaysRouter } from './modules/schedules.js';
import { router as clock } from './modules/clock.js';
import { router as locations, kioskRouter } from './modules/locations.js';
import { router as attendance } from './modules/attendance.js';
import { mountP1 } from './modules/index.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', env.TRUST_PROXY === 'true' ? true : env.TRUST_PROXY);
  app.disable('x-powered-by');
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-origin' } }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(loadUser);

  app.get('/api/health', async (_req, res) => {
    let dbOk = false;
    try { await pool.query('SELECT 1'); dbOk = true; } catch { /* */ }
    res.status(dbOk ? 200 : 503).json({ ok: dbOk, db: dbOk, time: new Date(), timezone: 'Africa/Abidjan' });
  });

  app.use('/api/auth', auth);
  app.use('/api/kiosk', kioskRouter);
  app.use('/api/setup', requireAuth, setup);
  app.use('/api/settings', requireAuth, settings);
  app.use('/api/departments', requireAuth, departmentsRouter);
  app.use('/api/positions', requireAuth, positionsRouter);
  app.use('/api/employees', requireAuth, employees);
  app.use('/api/schedules', requireAuth, schedules);
  app.use('/api/holidays', requireAuth, holidaysRouter);
  app.use('/api/clock', requireAuth, clock);
  app.use('/api/locations', locations);
  app.use('/api/attendance', requireAuth, attendance);
  mountP1(app);

  // Fichiers téléversés : photos et logo servis aux utilisateurs connectés ; justificatifs via route contrôlée uniquement
  app.use('/uploads/justifications', (_req, res) => res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Accès direct interdit.' } }));
  app.use('/uploads/company', express.static(path.join(env.UPLOAD_DIR, 'company'), { maxAge: '1h' }));
  app.use('/uploads', requireAuth, express.static(env.UPLOAD_DIR, { maxAge: '1h', index: false }));

  app.use('/api', (_req, _res, next) => next(new AppError(404, 'NOT_FOUND', 'Route API inconnue')));

  // Frontend compilé (mode tout-en-un sans Nginx)
  const web = path.resolve(process.cwd(), 'public');
  if (fs.existsSync(path.join(web, 'index.html'))) {
    app.use(express.static(web, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => res.sendFile(path.join(web, 'index.html')));
  }

  app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof AppError || (err?.status && err?.code && typeof err.code === 'string' && !/^\d/.test(err.code))) {
      return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    }
    if (err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: { code: 'FILE_TOO_LARGE', message: 'Fichier trop volumineux.' } });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: { code: 'BAD_JSON', message: 'Requête JSON invalide.' } });
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`, err);
    res.status(500).json({ error: { code: 'INTERNAL', message: 'Erreur interne du serveur. Réessayez ou contactez l\'administrateur.' } });
  });
  return app;
}
export { requireRole };
