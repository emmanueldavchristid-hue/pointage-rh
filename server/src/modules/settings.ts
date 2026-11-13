import { Router } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import net from 'node:net';
import { db, schema } from '../db/index.js';
import { ah, parse } from '../utils/http.js';
import { requireRole } from '../middlewares/auth.js';
import { audit } from '../services/audit.js';
import { getCompany, getSettings, saveSettings, clearSettingsCache } from '../services/settings.js';
import { companyInput } from './setup.js';
import { uploadImage, storeUpload } from '../services/files.js';
import { badRequest } from '../utils/errors.js';

export const router = Router();

router.get('/company', requireRole('SUPER_ADMIN', 'HR_ADMIN'), ah(async (_req, res) => res.json(await getCompany())));
router.put('/company', requireRole('SUPER_ADMIN'), ah(async (req, res) => {
  const data = parse(companyInput, req.body);
  const before = await getCompany();
  await db.update(schema.companies).set({ ...data, email: data.email || null, updatedAt: new Date() }).where(eq(schema.companies.id, before.id));
  clearSettingsCache();
  await audit(req, 'SETTINGS_COMPANY_UPDATED', { entity: 'company', entityId: before.id, before, after: data });
  res.json(await getCompany());
}));
router.post('/company/logo', requireRole('SUPER_ADMIN'), uploadImage.single('file'), ah(async (req, res) => {
  if (!req.file) throw badRequest('FILE_REQUIRED', 'Fichier manquant.');
  const p = await storeUpload(req.file, 'company');
  const c = await getCompany();
  await db.update(schema.companies).set({ logoPath: p, updatedAt: new Date() }).where(eq(schema.companies.id, c.id));
  await audit(req, 'SETTINGS_LOGO_UPDATED', { entity: 'company', entityId: c.id });
  res.json({ logoUrl: `/uploads/${p}` });
}));

const cidr = z.string().refine((s) => {
  const [ip, bits] = s.split('/');
  const fam = net.isIP(ip);
  const b = Number(bits);
  return fam > 0 && Number.isInteger(b) && b >= 0 && b <= (fam === 4 ? 32 : 128);
}, 'CIDR invalide (ex : 192.168.1.0/24)');

const settingsInput = z.object({
  clocking: z.object({ allowedNetworks: z.array(cidr).max(50), enforceNetwork: z.boolean(), maxAttemptsPerMinute: z.number().int().min(1).max(100),
    repeatedRefusalThreshold: z.number().int().min(2).max(100), dayCloseGraceMinutes: z.number().int().min(0).max(720) }).partial(),
  security: z.object({ sessionHours: z.number().int().min(1).max(168), maxLoginAttempts: z.number().int().min(3).max(20), lockMinutes: z.number().int().min(1).max(1440) }).partial(),
  retention: z.object({ auditDays: z.number().int().min(30), attendanceYears: z.number().int().min(1).max(30) }).partial(),
  backup: z.object({ enabled: z.boolean(), cron: z.string().min(9).max(60), keep: z.number().int().min(1).max(365) }).partial(),
  overtime: z.object({ requireValidation: z.boolean(), rates: z.array(z.object({ code: z.string().min(1).max(40), label: z.string().min(1).max(120), percent: z.number().min(0).max(500).nullable() })).max(20) }).partial(),
  anomalies: z.object({ maxWorkMinutes: z.number().int().min(60).max(1440), offHoursMarginMin: z.number().int().min(0).max(720) }).partial(),
}).partial();

router.get('/system', requireRole('SUPER_ADMIN', 'HR_ADMIN'), ah(async (_req, res) => res.json(await getSettings())));
router.put('/system', requireRole('SUPER_ADMIN'), ah(async (req, res) => {
  const patch = parse(settingsInput, req.body);
  const before = await getSettings();
  const merged: any = {};
  for (const [k, v] of Object.entries(patch)) merged[k] = { ...(before as any)[k], ...(v as object) };
  await saveSettings(merged, req.user!.id);
  await audit(req, 'SETTINGS_SYSTEM_UPDATED', { entity: 'system_settings', before, after: merged });
  res.json(await getSettings());
}));
