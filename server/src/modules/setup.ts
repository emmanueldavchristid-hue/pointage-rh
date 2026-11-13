import { Router } from 'express';
import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { ah, parse, zReason, zTime } from '../utils/http.js';
import { conflict } from '../utils/errors.js';
import { requireRole } from '../middlewares/auth.js';
import { audit } from '../services/audit.js';
import { getCompany, getSettings, clearSettingsCache } from '../services/settings.js';
import { versionInput, createVersion } from './schedules.js';
import { localDate } from '../utils/time.js';

export const router = Router();
router.use(requireRole('SUPER_ADMIN'));

export const companyInput = z.object({
  name: z.string().trim().min(2).max(160), legalName: z.string().max(200).optional().nullable(),
  address: z.string().max(500).optional().nullable(), phone: z.string().max(40).optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')), timezone: z.string().min(3).max(64).refine((tz) => {
    try { Intl.DateTimeFormat('fr', { timeZone: tz }); return true; } catch { return false; }
  }, 'fuseau horaire inconnu'),
  currency: z.string().min(3).max(8), openingTime: zTime.optional().nullable(), closingTime: zTime.optional().nullable(),
});

export async function checklist() {
  const c = await getCompany();
  const s = await getSettings();
  const [def] = await db.select().from(schema.schedules).where(and(eq(schema.schedules.isDefault, true), eq(schema.schedules.active, true)));
  const versions = def ? await db.select().from(schema.scheduleVersions).where(eq(schema.scheduleVersions.scheduleId, def.id)) : [];
  const locs = await db.select().from(schema.locationQrCodes).where(eq(schema.locationQrCodes.active, true));
  const hasIn = locs.some((l) => l.type === 'ENTREE' || l.type === 'MIXTE');
  const hasOut = locs.some((l) => l.type === 'SORTIE' || l.type === 'MIXTE');
  const types = await db.select().from(schema.leaveTypes).where(eq(schema.leaveTypes.active, true));
  return [
    { key: 'company', label: "Informations de l'établissement renseignées", done: !!c && c.name.trim().length > 1 && !!c.timezone },
    { key: 'schedule', label: 'Horaire de travail par défaut défini', done: !!def && versions.length > 0 },
    { key: 'locations', label: "QR Codes d'entrée et de sortie configurés", done: hasIn && hasOut },
    { key: 'network', label: 'Réseau local autorisé défini', done: !s.clocking.enforceNetwork || s.clocking.allowedNetworks.length > 0 },
    { key: 'leaveTypes', label: 'Types de congés et permissions disponibles', done: types.length > 0 },
  ];
}

router.get('/status', ah(async (_req, res) => {
  const c = await getCompany();
  res.json({ setupCompleted: !!c?.setupCompleted, clockingEnabled: !!c?.clockingEnabled, checklist: await checklist() });
}));

router.put('/company', ah(async (req, res) => {
  const data = parse(companyInput, req.body);
  const before = await getCompany();
  const values = { ...data, email: data.email || null, updatedAt: new Date() };
  if (before) await db.update(schema.companies).set(values).where(eq(schema.companies.id, before.id));
  else await db.insert(schema.companies).values(values);
  clearSettingsCache();
  await audit(req, 'SETTINGS_COMPANY_UPDATED', { entity: 'company', entityId: before?.id, before, after: values });
  res.json(await getCompany());
}));

router.put('/schedule', ah(async (req, res) => {
  const v = parse(versionInput.extend({ name: z.string().min(2).max(120).optional() }), req.body);
  let [def] = await db.select().from(schema.schedules).where(eq(schema.schedules.isDefault, true));
  if (!def) [def] = await db.insert(schema.schedules).values({ name: v.name ?? 'Horaire standard', isDefault: true }).returning();
  const version = await createVersion(req, def.id, v, true);
  res.json({ schedule: def, version });
}));

router.post('/activate', ah(async (req, res) => {
  const list = await checklist();
  const missing = list.filter((i) => !i.done);
  if (missing.length) throw conflict('SETUP_INCOMPLETE', `Configuration incomplète : ${missing.map((m) => m.label).join(', ')}.`, missing);
  const c = await getCompany();
  await db.update(schema.companies).set({ setupCompleted: true, clockingEnabled: true, activatedAt: c.activatedAt ?? new Date(), updatedAt: new Date() })
    .where(eq(schema.companies.id, c.id));
  clearSettingsCache();
  await audit(req, 'CLOCKING_ACTIVATED', { entity: 'company', entityId: c.id, after: { date: localDate(new Date(), c.timezone) } });
  res.json({ ok: true, setupCompleted: true, clockingEnabled: true });
}));

router.post('/deactivate', ah(async (req, res) => {
  const { reason } = parse(z.object({ reason: zReason }), req.body);
  const c = await getCompany();
  await db.update(schema.companies).set({ clockingEnabled: false, updatedAt: new Date() }).where(eq(schema.companies.id, c.id));
  await audit(req, 'CLOCKING_SUSPENDED', { entity: 'company', entityId: c.id, reason });
  res.json({ ok: true, clockingEnabled: false });
}));
export { inArray };
