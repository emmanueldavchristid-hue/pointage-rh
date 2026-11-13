import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';

export interface SystemSettings {
  clocking: { allowedNetworks: string[]; enforceNetwork: boolean; maxAttemptsPerMinute: number; repeatedRefusalThreshold: number; dayCloseGraceMinutes: number };
  security: { sessionHours: number; maxLoginAttempts: number; lockMinutes: number };
  retention: { auditDays: number; attendanceYears: number };
  backup: { enabled: boolean; cron: string; keep: number };
  overtime: { requireValidation: boolean; rates: { code: string; label: string; percent: number | null }[] };
  anomalies: { maxWorkMinutes: number; offHoursMarginMin: number };
}

export const DEFAULT_SETTINGS: SystemSettings = {
  clocking: {
    // Réseaux privés RFC1918 par défaut : à restreindre au sous-réseau réel de l'entreprise
    allowedNetworks: ['192.168.0.0/16', '10.0.0.0/8', '172.16.0.0/12', '127.0.0.1/32', '::1/128'],
    enforceNetwork: true, maxAttemptsPerMinute: 10, repeatedRefusalThreshold: 5, dayCloseGraceMinutes: 120,
  },
  security: { sessionHours: 12, maxLoginAttempts: 5, lockMinutes: 15 },
  retention: { auditDays: 1825, attendanceYears: 5 },
  backup: { enabled: true, cron: '30 23 * * *', keep: 30 },
  // Aucun taux de majoration inventé : à paramétrer selon la convention / le droit du travail ivoirien
  overtime: { requireValidation: true, rates: [] },
  anomalies: { maxWorkMinutes: 720, offHoursMarginMin: 180 },
};

let cache: { at: number; value: SystemSettings } | null = null;

export async function getSettings(): Promise<SystemSettings> {
  if (cache && Date.now() - cache.at < 10_000) return cache.value;
  const rows = await db.select().from(schema.systemSettings);
  const value: any = structuredClone(DEFAULT_SETTINGS);
  for (const r of rows) if (r.key in value) value[r.key] = { ...value[r.key], ...(r.value as object) };
  cache = { at: Date.now(), value };
  return value;
}

export async function saveSettings(patch: Partial<SystemSettings>, userId: number) {
  for (const [key, value] of Object.entries(patch)) {
    await db.insert(schema.systemSettings).values({ key, value, updatedBy: userId })
      .onConflictDoUpdate({ target: schema.systemSettings.key, set: { value, updatedBy: userId, updatedAt: new Date() } });
  }
  cache = null;
}

export async function getCompany() {
  const [c] = await db.select().from(schema.companies).orderBy(schema.companies.id).limit(1);
  return c;
}
export const companyTz = async () => (await getCompany())?.timezone || 'Africa/Abidjan';
export const clearSettingsCache = () => { cache = null; };
export { eq };
