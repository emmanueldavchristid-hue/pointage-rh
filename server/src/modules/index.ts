import type { Express } from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { router as notifications } from './notifications.js';
import { router as me } from './me.js';
import { router as anomalies, absencesRouter } from './anomalies.js';
import { router as leaves, leaveTypesRouter, justificationsRouter } from './leaves.js';
import { overtimeRouter, auditRouter, usersRouter, backupsRouter } from './admin.js';
import { router as dashboard } from './dashboard.js';
import { router as reports } from './reports.js';

export function mountP1(app: Express) {
  app.use('/api/notifications', requireAuth, notifications);
  app.use('/api/me', requireAuth, me);
  app.use('/api/anomalies', requireAuth, anomalies);
  app.use('/api/absences', requireAuth, absencesRouter);
  app.use('/api/leave-types', requireAuth, leaveTypesRouter);
  app.use('/api/leaves', requireAuth, leaves);
  app.use('/api/justifications', requireAuth, justificationsRouter);
  app.use('/api/overtime', requireAuth, overtimeRouter);
  app.use('/api/audit', requireAuth, auditRouter);
  app.use('/api/users', requireAuth, usersRouter);
  app.use('/api/backups', requireAuth, backupsRouter);
  app.use('/api/dashboard', requireAuth, dashboard);
  app.use('/api/reports', requireAuth, reports);
}
