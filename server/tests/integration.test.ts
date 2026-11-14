/**
 * Tests d'intégration bout en bout (API réelle + PostgreSQL de test, horloge simulée).
 * Couvre les scénarios obligatoires du cahier des charges (§15) et de l'addendum (§9).
 */
import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { sql, eq, and } from 'drizzle-orm';

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgres://pointage:pointage@localhost:5432/pointage_test';
process.env.DISABLE_JOBS = 'true';

const { db, pool, schema } = await import('../src/db/index.js');
const { runMigrations } = await import('../src/db/migrate.js');
const { createApp } = await import('../src/app.js');
const { payloadFor } = await import('../src/modules/locations.js');
const { closeDays } = await import('../src/services/attendance.js');
const { resetClockRateLimit } = await import('../src/services/clock.js');
const { clearSettingsCache, saveSettings, DEFAULT_SETTINGS } = await import('../src/services/settings.js');
const { makeQrPayload } = await import('../src/services/qr.js');

const app = createApp();
const MON = '2026-11-16', TUE = '2026-11-17', WED = '2026-11-18', THU = '2026-11-19', FRI = '2026-11-20', SAT = '2026-11-21';
const at = (d: string, hm: string) => new Date(`${d}T${hm}:00Z`); // Abidjan = UTC+0
const setNow = (d: Date) => vi.setSystemTime(d);

let ids: Record<string, number> = {};
let companyId = 0;
let locIn: any, locOut: any;

async function login(loginName: string, password = 'Test2026!') {
  const agent = request.agent(app);
  const r = await agent.post('/api/auth/login').send({ login: loginName, password });
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return agent;
}
const qr = (loc: any) => payloadFor(loc, companyId).payload;
let k = 0;
const scan = (agent: any, action: string, loc: any, key?: string) => agent.post('/api/clock/scan').send({ action, qrPayload: qr(loc), idempotencyKey: key ?? `key-${++k}-${Math.random()}` });

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  setNow(at(MON, '06:00'));
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS drizzle CASCADE;');
  await runMigrations();
  const [c] = await db.insert(schema.companies).values({ name: 'Test SA', timezone: 'Africa/Abidjan', currency: 'XOF', setupCompleted: true, clockingEnabled: true, activatedAt: at('2026-11-01', '00:00') }).returning();
  companyId = c.id;
  const [dep1] = await db.insert(schema.departments).values({ name: 'Commercial', code: 'COM' }).returning();
  const [dep2] = await db.insert(schema.departments).values({ name: 'Logistique', code: 'LOG' }).returning();
  const [std] = await db.insert(schema.schedules).values({ name: 'Standard', isDefault: true }).returning();
  await db.insert(schema.scheduleVersions).values({ scheduleId: std.id, effectiveFrom: '2026-01-01', startTime: '08:00', endTime: '17:00', breakStart: '12:00', breakEnd: '13:00',
    workDays: [1, 2, 3, 4, 5], dailyMinutes: 480, lateToleranceMin: 10, earlyLeaveToleranceMin: 0, overtimeThresholdMin: 0 });
  const [pause] = await db.insert(schema.schedules).values({ name: 'Pauses pointées' }).returning();
  await db.insert(schema.scheduleVersions).values({ scheduleId: pause.id, effectiveFrom: '2026-01-01', startTime: '07:00', endTime: '16:00', breakStart: '12:00', breakEnd: '13:00',
    workDays: [1, 2, 3, 4, 5, 6], dailyMinutes: 480, lateToleranceMin: 5, breakTracking: true, maxBreaks: 1 });
  ids.std = std.id; ids.pause = pause.id; ids.dep1 = dep1.id; ids.dep2 = dep2.id;
  const pw = await bcrypt.hash('Test2026!', 4);
  const mk = async (mat: string, dep: number, role: any) => {
    const [e] = await db.insert(schema.employees).values({ matricule: mat, lastName: mat, firstNames: 'Test', departmentId: dep, email: `${mat.toLowerCase()}@t.ci` }).returning();
    await db.insert(schema.users).values({ employeeId: e.id, login: `${mat.toLowerCase()}@t.ci`, passwordHash: pw, role, mustChangePassword: false });
    ids[mat] = e.id;
  };
  await mk('E1', dep1.id, 'EMPLOYEE'); await mk('E2', dep1.id, 'EMPLOYEE'); await mk('E3', dep1.id, 'EMPLOYEE'); await mk('E4', dep2.id, 'EMPLOYEE');
  await mk('E5', dep2.id, 'EMPLOYEE'); await mk('MGR', dep1.id, 'MANAGER'); await mk('RH', dep2.id, 'HR_ADMIN');
  await db.update(schema.departments).set({ managerEmployeeId: ids.MGR }).where(eq(schema.departments.id, dep1.id));
  await db.insert(schema.users).values({ login: 'root', passwordHash: pw, role: 'SUPER_ADMIN', mustChangePassword: false });
  await db.insert(schema.scheduleAssignments).values({ scheduleId: pause.id, employeeId: ids.E5, effectiveFrom: '2026-01-01' });
  [locIn] = await db.insert(schema.locationQrCodes).values({ code: 'QR_ENTREE', label: 'Entrée', type: 'ENTREE', displayKey: 'k1' }).returning();
  [locOut] = await db.insert(schema.locationQrCodes).values({ code: 'QR_SORTIE', label: 'Sortie', type: 'SORTIE', displayKey: 'k2' }).returning();
  await db.insert(schema.leaveTypes).values({ code: 'CONGE_ANNUEL', label: 'Congé annuel', category: 'CONGE', requiresHrValidation: true });
  await db.insert(schema.holidays).values({ date: '2026-11-15', label: 'Journée nationale de la Paix', recurring: true });
  clearSettingsCache();
});
afterAll(async () => { vi.useRealTimers(); await pool.end(); });
beforeEach(() => resetClockRateLimit());

describe('Authentification et rôles', () => {
  it('§15.1 un employé se connecte (matricule) ; mot de passe incorrect refusé', async () => {
    await login('E1');
    const r = await request(app).post('/api/auth/login').send({ login: 'E1', password: 'faux' });
    expect(r.status).toBe(401); expect(r.body.error.code).toBe('INVALID_CREDENTIALS');
  });
  it('blocage temporaire après 5 échecs', async () => {
    for (let i = 0; i < 4; i++) await request(app).post('/api/auth/login').send({ login: 'E3', password: 'x' });
    const r = await request(app).post('/api/auth/login').send({ login: 'E3', password: 'x' });
    expect(r.status).toBe(423);
    const r2 = await request(app).post('/api/auth/login').send({ login: 'E3', password: 'Test2026!' });
    expect(r2.status).toBe(423);
    await db.update(schema.users).set({ lockedUntil: null, failedAttempts: 0 }).where(sql`login = 'e3@t.ci'`);
  });
  it('cookie de session HttpOnly + SameSite=Strict, jamais de jeton dans le corps', async () => {
    const r = await request(app).post('/api/auth/login').send({ login: 'E1', password: 'Test2026!' });
    const ck = String(r.headers['set-cookie']);
    expect(ck).toMatch(/HttpOnly/); expect(ck).toMatch(/SameSite=Strict/);
    expect(JSON.stringify(r.body)).not.toMatch(/eyJ/);
  });
  it('§15.18-19 un responsable ne peut pas accéder à un autre département', async () => {
    const m = await login('mgr@t.ci');
    expect((await m.get(`/api/employees/${ids.E4}`)).status).toBe(403);
    expect((await m.get(`/api/employees/${ids.E1}`)).status).toBe(200);
    const list = await m.get('/api/employees');
    expect(list.body.items.every((e: any) => e.departmentId === ids.dep1)).toBe(true);
  });
  it('un employé ne peut pas consulter les autres employés ni corriger', async () => {
    const e = await login('E1');
    expect((await e.get('/api/employees')).status).toBe(403);
    expect((await e.get(`/api/employees/${ids.E2}`)).status).toBe(403);
    expect((await e.post('/api/attendance/exceptional').send({})).status).toBe(403);
  });
  it('un RH ne peut pas modifier les paramètres techniques', async () => {
    const rh = await login('rh@t.ci');
    expect((await rh.put('/api/settings/system').send({ clocking: { enforceNetwork: false } })).status).toBe(403);
  });
});

describe('Pointage : arrivées', () => {
  it('add.1 arrivée à l\'heure (08:00) → présent, retard 0 ; §15.3 visible dans le tableau de présence', async () => {
    setNow(at(MON, '08:00'));
    const e = await login('E1');
    const r = await scan(e, 'ARRIVEE', locIn);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.status.state).toBe('PRESENT'); expect(r.body.status.lateMinutes).toBe(0);
    expect(new Date(r.body.event.serverTime).toISOString()).toBe(at(MON, '08:00').toISOString());
    const rh = await login('rh@t.ci');
    const live = await rh.get(`/api/attendance/live?date=${MON}`);
    expect(live.body.present.some((a: any) => a.employeeId === ids.E1)).toBe(true);
  });
  it('add.2 arrivée avant l\'heure → retard 0', async () => {
    setNow(at(MON, '07:40'));
    const r = await scan(await login('E2'), 'ARRIVEE', locIn);
    expect(r.status).toBe(200); expect(r.body.status.lateMinutes).toBe(0);
  });
  it('add.3 arrivée pendant la tolérance (08:08) → retard retenu 0', async () => {
    setNow(at(TUE, '08:08'));
    const r = await scan(await login('E1'), 'ARRIVEE', locIn);
    expect(r.body.status.lateMinutes).toBe(0);
  });
  it('add.4 / §15.8-9 arrivée après la tolérance (08:25) → 15 min', async () => {
    setNow(at(TUE, '08:25'));
    const r = await scan(await login('E2'), 'ARRIVEE', locIn);
    expect(r.body.status.lateMinutes).toBe(15);
    expect(r.body.warnings.join(' ')).toMatch(/Retard/);
  });
  it('heure client ignorée : seule l\'heure serveur compte', async () => {
    setNow(at(TUE, '08:30'));
    const e = await login('E4');
    const r = await e.post('/api/clock/scan').send({ action: 'ARRIVEE', qrPayload: qr(locIn), idempotencyKey: 'client-time-1', clientTime: '2026-11-17T07:00:00Z' });
    expect(r.body.status.lateMinutes).toBe(20);
  });
});

describe('Pointage : doublons et incohérences', () => {
  it('add.5 / §15.4-5 double scan immédiat (même requête rejouée) → aucun doublon', async () => {
    setNow(at(WED, '08:00'));
    const e = await login('E1');
    const a = await scan(e, 'ARRIVEE', locIn, 'same-key-1');
    const b = await scan(e, 'ARRIVEE', locIn, 'same-key-1');
    expect(a.status).toBe(200); expect(b.status).toBe(200); expect(b.body.replay).toBe(true);
    const n = await db.select().from(schema.attendanceEvents).where(and(eq(schema.attendanceEvents.employeeId, ids.E1), eq(schema.attendanceEvents.workDate, WED), eq(schema.attendanceEvents.result, 'ACCEPTE')));
    expect(n.length).toBe(1);
  });
  it('add.6 double scan après plusieurs minutes → refus explicite avec l\'heure existante', async () => {
    setNow(at(WED, '08:07'));
    const r = await scan(await login('E1'), 'ARRIVEE', locIn);
    expect(r.status).toBe(409); expect(r.body.error.code).toBe('DOUBLE_ARRIVEE');
    expect(r.body.error.message).toMatch(/08:00/); expect(r.body.error.details.existingTime).toBe(at(WED, '08:00').toISOString());
    const an = await db.select().from(schema.anomalies).where(and(eq(schema.anomalies.employeeId, ids.E1), eq(schema.anomalies.type, 'DOUBLE_ARRIVEE')));
    expect(an.length).toBe(1);
  });
  it('add.7 / §15.23 requêtes simultanées (10 scans parallèles, clés différentes) → une seule arrivée', async () => {
    setNow(at(WED, '08:02'));
    const e = await login('E2');
    const res = await Promise.all(Array.from({ length: 10 }, (_, i) => scan(e, 'ARRIVEE', locIn, `parallel-${i}-key`)));
    expect(res.filter((r) => r.status === 200).length).toBe(1);
    expect(res.filter((r) => r.status === 409).length).toBe(9);
    const n = await db.select().from(schema.attendanceEvents).where(and(eq(schema.attendanceEvents.employeeId, ids.E2), eq(schema.attendanceEvents.workDate, WED), eq(schema.attendanceEvents.result, 'ACCEPTE')));
    expect(n.length).toBe(1);
  });
  it('§15.23 plusieurs téléphones (employés différents) pointent simultanément', async () => {
    setNow(at(THU, '07:59'));
    const agents = await Promise.all(['E1', 'E2', 'E4', 'mgr@t.ci'].map((l) => login(l)));
    const res = await Promise.all(agents.map((a) => scan(a, 'ARRIVEE', locIn)));
    expect(res.map((r) => r.status)).toEqual([200, 200, 200, 200]);
  });
  it('add.8 départ sans arrivée → refusé + anomalie', async () => {
    setNow(at(WED, '17:00'));
    const r = await scan(await login('E3'), 'DEPART', locOut);
    expect(r.status).toBe(409); expect(r.body.error.code).toBe('DEPART_SANS_ARRIVEE');
    const [att] = await db.select().from(schema.attendances).where(and(eq(schema.attendances.employeeId, ids.E3), eq(schema.attendances.workDate, WED)));
    expect(att?.arrivalAt ?? null).toBeNull(); // aucune fausse présence
  });
  it('mauvais QR (entrée pour un départ) → QR_WRONG_TYPE', async () => {
    setNow(at(WED, '17:00'));
    const r = await scan(await login('E1'), 'DEPART', locIn);
    expect(r.body.error.code).toBe('QR_WRONG_TYPE');
  });
  it('§15.6-7 départ → durée de présence et travail effectif calculés', async () => {
    setNow(at(WED, '17:00'));
    const r = await scan(await login('E1'), 'DEPART', locOut);
    expect(r.status).toBe(200); expect(r.body.status.state).toBe('PARTI'); expect(r.body.status.workedMinutes).toBe(480);
    const [att] = await db.select().from(schema.attendances).where(and(eq(schema.attendances.employeeId, ids.E1), eq(schema.attendances.workDate, WED)));
    expect(att.presenceMinutes).toBe(540); expect(att.breakMinutes).toBe(60);
  });
  it('add.9 double départ → refusé', async () => {
    setNow(at(WED, '17:05'));
    const r = await scan(await login('E1'), 'DEPART', locOut);
    expect(r.body.error.code).toBe('DOUBLE_DEPART');
  });
  it('arrivée après départ définitif → refusée', async () => {
    setNow(at(WED, '17:10'));
    const r = await scan(await login('E1'), 'ARRIVEE', locIn);
    expect(r.body.error.code).toBe('ARRIVEE_APRES_DEPART');
  });
  it('add.11 départ anticipé (16:00) → 60 min ; §15.17 HS potentielles (18:30)', async () => {
    setNow(at(WED, '16:00'));
    const r = await scan(await login('E2'), 'DEPART', locOut);
    expect(r.body.warnings.join(' ')).toMatch(/anticipé/);
    const [a] = await db.select().from(schema.attendances).where(and(eq(schema.attendances.employeeId, ids.E2), eq(schema.attendances.workDate, WED)));
    expect(a.earlyLeaveMinutes).toBe(60);
    setNow(at(TUE, '18:30'));
    await scan(await login('E2'), 'DEPART', locOut);
    const [b] = await db.select().from(schema.attendances).where(and(eq(schema.attendances.employeeId, ids.E2), eq(schema.attendances.workDate, TUE)));
    expect(b.workedMinutes).toBe(545); expect(b.overtimePotentialMinutes).toBe(65);
    const [ot] = await db.select().from(schema.overtimeRecords).where(eq(schema.overtimeRecords.attendanceId, b.id));
    expect(ot.status).toBe('EN_ATTENTE'); // jamais validées automatiquement
  });
});

describe('Pauses pointées (machine à états)', () => {
  it('cycle complet et refus du départ pendant la pause', async () => {
    const e = await login('E5');
    setNow(at(MON, '07:00')); expect((await scan(e, 'ARRIVEE', locIn)).status).toBe(200);
    setNow(at(MON, '12:00')); expect((await scan(e, 'PAUSE_DEBUT', locOut)).body.status.state).toBe('EN_PAUSE');
    setNow(at(MON, '12:30')); expect((await scan(e, 'DEPART', locOut)).body.error.code).toBe('PAUSE_EN_COURS');
    setNow(at(MON, '12:45')); expect((await scan(e, 'PAUSE_FIN', locIn)).body.status.state).toBe('DE_RETOUR_DE_PAUSE');
    setNow(at(MON, '13:00')); expect((await scan(e, 'PAUSE_DEBUT', locOut)).body.error.code).toBe('MAX_PAUSES_ATTEINT');
    setNow(at(MON, '16:00')); const r = await scan(e, 'DEPART', locOut);
    expect(r.body.status.state).toBe('PARTI');
    const [a] = await db.select().from(schema.attendances).where(and(eq(schema.attendances.employeeId, ids.E5), eq(schema.attendances.workDate, MON)));
    expect(a.breakMinutes).toBe(45); expect(a.workedMinutes).toBe(495);
  });
  it('pause refusée si non activée pour l\'horaire', async () => {
    setNow(at(THU, '12:00'));
    expect((await scan(await login('E1'), 'PAUSE_DEBUT', locOut)).body.error.code).toBe('PAUSE_NON_AUTORISEE');
  });
});

describe('Sécurité des QR et du réseau', () => {
  it('add.17 QR expiré', async () => {
    setNow(at(FRI, '07:55'));
    const old = qr(locIn);
    setNow(at(FRI, '08:00'));
    const r = await (await login('E1')).post('/api/clock/scan').send({ action: 'ARRIVEE', qrPayload: old, idempotencyKey: 'expired-key-1' });
    expect(r.body.error.code).toBe('QR_EXPIRED');
  });
  it('add.18 QR falsifié (signature invalide) et QR d\'un autre établissement', async () => {
    setNow(at(FRI, '08:00'));
    const e = await login('E1');
    const forged = makeQrPayload({ c: companyId, l: locIn.id, t: 'ENTREE', v: 1, m: 'D', w: Math.floor(Date.now() / 30000) }, 'mauvais-secret-de-test-123456');
    expect((await e.post('/api/clock/scan').send({ action: 'ARRIVEE', qrPayload: forged, idempotencyKey: 'forged-key-1' })).body.error.code).toBe('QR_INVALID');
    const other = makeQrPayload({ c: 999, l: locIn.id, t: 'ENTREE', v: 1, m: 'D', w: Math.floor(Date.now() / 30000) }, process.env.QR_SECRET || 'dev-qr-secret-change-me-32chars!!!!');
    expect((await e.post('/api/clock/scan').send({ action: 'ARRIVEE', qrPayload: other, idempotencyKey: 'forged-key-2' })).body.error.code).toBe('QR_WRONG_COMPANY');
    expect((await e.post('/api/clock/scan').send({ action: 'ARRIVEE', qrPayload: 'https://phishing.example', idempotencyKey: 'forged-key-3' })).body.error.code).toBe('QR_INVALID');
  });
  it('QR révoqué (rotation du secret) refusé', async () => {
    setNow(at(FRI, '08:01'));
    const before = qr(locIn);
    const root = await login('root');
    await root.post(`/api/locations/${locIn.id}/rotate-secret`);
    [locIn] = await db.select().from(schema.locationQrCodes).where(eq(schema.locationQrCodes.id, locIn.id));
    const r = await (await login('E1')).post('/api/clock/scan').send({ action: 'ARRIVEE', qrPayload: before, idempotencyKey: 'revoked-key-1' });
    expect(r.body.error.code).toBe('QR_INVALID');
  });
  it('scan hors du réseau autorisé refusé', async () => {
    setNow(at(FRI, '08:02'));
    await saveSettings({ clocking: { ...DEFAULT_SETTINGS.clocking, allowedNetworks: ['10.10.0.0/16'] } }, 0);
    const r = await scan(await login('E1'), 'ARRIVEE', locIn);
    expect(r.status).toBe(403); expect(r.body.error.code).toBe('NETWORK_NOT_ALLOWED');
    await saveSettings({ clocking: DEFAULT_SETTINGS.clocking }, 0);
  });
  it('add.16 employé désactivé : session coupée et pointage impossible', async () => {
    setNow(at(FRI, '08:03'));
    const e = await login('E4');
    const rh = await login('rh@t.ci');
    expect((await rh.post(`/api/employees/${ids.E4}/deactivate`).send({ reason: 'Fin de contrat (test)' })).status).toBe(200);
    expect((await scan(e, 'ARRIVEE', locIn)).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ login: 'E4', password: 'Test2026!' })).status).toBe(403);
    await rh.post(`/api/employees/${ids.E4}/reactivate`).send({ reason: 'Réintégration (test)' });
  });
  it('limitation du nombre de tentatives', async () => {
    setNow(at(FRI, '09:00'));
    const e = await login('E3');
    let last: any;
    for (let i = 0; i < 12; i++) last = await scan(e, 'DEPART', locOut);
    expect(last.status).toBe(429);
  });
  it('événements refusés journalisés (jamais de fausse présence)', async () => {
    const refused = await db.select().from(schema.attendanceEvents).where(eq(schema.attendanceEvents.result, 'REFUSE'));
    expect(refused.length).toBeGreaterThan(10);
  });
  it('journal immuable : suppression/modification d\'un événement ou de l\'audit impossible en base', async () => {
    await expect(pool.query('DELETE FROM attendance_events WHERE id = (SELECT min(id) FROM attendance_events)')).rejects.toThrow(/interdite/);
    await expect(pool.query("UPDATE audit_logs SET action = 'X' WHERE id = (SELECT min(id) FROM audit_logs)")).rejects.toThrow(/modification interdite/);
  });
});

describe('Jours particuliers', () => {
  it('add.13 pointage un jour férié (dimanche 15/11) → accepté + anomalie', async () => {
    setNow(at('2026-11-15', '09:00'));
    const r = await scan(await login('E1'), 'ARRIVEE', locIn);
    expect(r.status).toBe(200); expect(r.body.warnings.join(' ')).toMatch(/férié/);
    const an = await db.select().from(schema.anomalies).where(and(eq(schema.anomalies.employeeId, ids.E1), eq(schema.anomalies.type, 'JOUR_NON_TRAVAILLE')));
    expect(an.length).toBe(1);
  });
  it('pointage un jour non travaillé (samedi) → accepté, signalé, pas de retard', async () => {
    setNow(at(SAT, '10:00'));
    const r = await scan(await login('E2'), 'ARRIVEE', locIn);
    expect(r.status).toBe(200); expect(r.body.status.lateMinutes).toBe(0); expect(r.body.warnings.join(' ')).toMatch(/non travaillé/);
  });
});

describe('Horaires versionnés', () => {
  it('add.14 modification d\'horaire avec date d\'effet : les anciennes journées gardent leurs règles', async () => {
    setNow(at(FRI, '06:00'));
    const root = await login('root');
    const r = await root.post(`/api/schedules/${ids.std}/versions`).send({ effectiveFrom: FRI, startTime: '09:00', endTime: '18:00', breakStart: '13:00', breakEnd: '14:00',
      workDays: [1, 2, 3, 4, 5], dailyMinutes: 480, lateToleranceMin: 5 });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    setNow(at(FRI, '09:20'));
    const s = await scan(await login('E2'), 'ARRIVEE', locIn);
    expect(s.body.status.schedule.startTime).toBe('09:00'); expect(s.body.status.lateMinutes).toBe(15);
    const [old] = await db.select().from(schema.attendances).where(and(eq(schema.attendances.employeeId, ids.E2), eq(schema.attendances.workDate, TUE)));
    expect(old.lateMinutes).toBe(15); // toujours calculé avec 08:00 / tolérance 10
  });
  it('add.15 affectation individuelle prioritaire sur le département', async () => {
    const root = await login('root');
    const r = await root.get(`/api/schedules/resolve?employeeId=${ids.E5}&date=${FRI}`);
    expect(r.body.source).toBe('EMPLOYE'); expect(r.body.schedule.id).toBe(ids.pause);
    const r2 = await root.get(`/api/schedules/resolve?employeeId=${ids.E4}&date=${FRI}`);
    expect(r2.body.source).toBe('DEFAUT');
  });
  it('version passée refusée pour un RH (pas de recalcul rétroactif)', async () => {
    const rh = await login('rh@t.ci');
    const r = await rh.post(`/api/schedules/${ids.std}/versions`).send({ effectiveFrom: MON, startTime: '07:00', endTime: '16:00', workDays: [1, 2, 3, 4, 5], dailyMinutes: 480, lateToleranceMin: 5 });
    expect(r.body.error.code).toBe('EFFECTIVE_DATE_PAST');
  });
});

describe('Oubli de pointage, anomalies et régularisation', () => {
  it('add.10 / §15.10-11 oubli de départ → clôture : POINTAGE_INCOMPLET + anomalie visible par les RH', async () => {
    // E1 arrivé jeudi 07:59 sans départ ; E3 absent mercredi (aucun pointage)
    setNow(at(FRI, '23:00'));
    await closeDays({ daysBack: 6 });
    const [a] = await db.select().from(schema.attendances).where(and(eq(schema.attendances.employeeId, ids.E1), eq(schema.attendances.workDate, THU)));
    expect(a.state).toBe('POINTAGE_INCOMPLET'); expect(a.dayStatus).toBe('INCOMPLET');
    const rh = await login('rh@t.ci');
    const an = await rh.get(`/api/anomalies?type=DEPART_MANQUANT&employeeId=${ids.E1}&from=${THU}&to=${THU}`);
    expect(an.body.items.length).toBe(1);
    const [abs] = await db.select().from(schema.attendances).where(and(eq(schema.attendances.employeeId, ids.E3), eq(schema.attendances.workDate, WED)));
    expect(abs.dayStatus).toBe('ABSENCE_NON_JUSTIFIEE');
  });
  it('aucune absence avant la création de la fiche (employé sans date d\'embauche)', async () => {
    const [n] = await db.insert(schema.employees).values({ matricule: 'NEW1', lastName: 'Nouveau', firstNames: 'Test', departmentId: ids.dep1, createdAt: at(THU, '10:00') }).returning();
    await closeDays({ daysBack: 6 });
    const rows = await db.select().from(schema.attendances).where(eq(schema.attendances.employeeId, n.id));
    expect(rows.every((r) => r.workDate >= THU)).toBe(true);
    expect(rows.some((r) => r.workDate === MON)).toBe(false);
  });
  it('une absence n\'est pas déclarée injustifiée avant la fin de journée', async () => {
    setNow(at('2026-11-23', '10:00')); // lundi matin
    await closeDays({ daysBack: 0 });
    const [a] = await db.select().from(schema.attendances).where(and(eq(schema.attendances.employeeId, ids.E3), eq(schema.attendances.workDate, '2026-11-23')));
    expect(a).toBeUndefined();
  });
  it('add.20 / §15.12 régularisation administrative avec motif, historique conservé', async () => {
    setNow(at('2026-11-23', '10:00'));
    const rh = await login('rh@t.ci');
    const [a] = await db.select().from(schema.attendances).where(and(eq(schema.attendances.employeeId, ids.E1), eq(schema.attendances.workDate, THU)));
    const noReason = await rh.post(`/api/attendance/${a.id}/correct`).send({ departureAt: `${THU}T17:05:00Z`, reason: '' });
    expect(noReason.status).toBe(422);
    const r = await rh.post(`/api/attendance/${a.id}/correct`).send({ departureAt: `${THU}T17:05:00Z`, reason: 'Oubli de badge confirmé par le responsable' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.state).toBe('PARTI'); expect(r.body.corrected).toBe(true); expect(r.body.workedMinutes).toBe(486);
    const detail = await rh.get(`/api/attendance/${a.id}`);
    expect(detail.body.corrections[0]).toMatchObject({ field: 'departureAt', oldValue: null, reason: 'Oubli de badge confirmé par le responsable', adminLogin: 'rh@t.ci' });
    expect(detail.body.anomalies.find((x: any) => x.type === 'DEPART_MANQUANT').status).toBe('RESOLUE');
    // correction d'une arrivée existante : l'événement initial est conservé et marqué remplacé
    const r2 = await rh.post(`/api/attendance/${a.id}/correct`).send({ arrivalAt: `${THU}T07:50:00Z`, reason: 'Arrivée réelle constatée par le gardien' });
    expect(r2.status).toBe(200);
    const evs = await db.select().from(schema.attendanceEvents).where(and(eq(schema.attendanceEvents.attendanceId, a.id), eq(schema.attendanceEvents.type, 'ARRIVEE')));
    expect(evs.length).toBe(2); expect(evs.filter((e) => e.supersededBy).length).toBe(1);
    const audit = await db.select().from(schema.auditLogs).where(eq(schema.auditLogs.action, 'ATTENDANCE_CORRECTED'));
    expect(audit.length).toBe(2);
  });
  it('pointage exceptionnel (panne réseau) avec motif', async () => {
    const rh = await login('rh@t.ci');
    const r = await rh.post('/api/attendance/exceptional').send({ employeeId: ids.E3, workDate: WED, arrivalAt: `${WED}T08:00:00Z`, departureAt: `${WED}T17:00:00Z`, reason: 'Panne du réseau Wi-Fi, registre papier signé' });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.dayStatus).toBe('PRESENT'); expect(r.body.workedMinutes).toBe(480);
  });
  it('justificatif validé → absence justifiée', async () => {
    setNow(at('2026-11-24', '09:00'));
    await closeDays({ daysBack: 1 }); // lundi 23 : E3 absent
    const e = await login('E3');
    const j = await e.post('/api/justifications').field('workDate', '2026-11-23').field('reason', 'Rendez-vous administratif (test)');
    expect(j.status, JSON.stringify(j.body)).toBe(201);
    const rh = await login('rh@t.ci');
    expect((await rh.post(`/api/justifications/${j.body.id}/review`).send({ status: 'VALIDE' })).status).toBe(200);
    const [a] = await db.select().from(schema.attendances).where(and(eq(schema.attendances.employeeId, ids.E3), eq(schema.attendances.workDate, '2026-11-23')));
    expect(a.dayStatus).toBe('ABSENCE_JUSTIFIEE');
  });
});

describe('Congés (workflow complet)', () => {
  let leaveId = 0;
  it('§15.13 un employé demande un congé ; le responsable est notifié', async () => {
    setNow(at('2026-11-24', '10:00'));
    const e = await login('E1');
    const types = await e.get('/api/leave-types');
    const r = await e.post('/api/leaves').send({ leaveTypeId: types.body[0].id, startDate: '2026-11-26', endDate: '2026-11-27', comment: 'Congé test' });
    expect(r.status, JSON.stringify(r.body)).toBe(201); expect(r.body.status).toBe('EN_ATTENTE'); expect(r.body.workingDays).toBe(2);
    leaveId = r.body.id;
    const m = await login('mgr@t.ci');
    const n = await m.get('/api/notifications');
    expect(n.body.items.some((x: any) => x.type === 'DEMANDE_CONGE')).toBe(true);
    const overlap = await e.post('/api/leaves').send({ leaveTypeId: types.body[0].id, startDate: '2026-11-27', endDate: '2026-11-28' });
    expect(overlap.body.error.code).toBe('OVERLAP');
  });
  it('§15.14 le responsable examine ; un responsable d\'un autre département ne peut pas', async () => {
    const rhEarly = await login('rh@t.ci');
    const early = await rhEarly.post(`/api/leaves/${leaveId}/decide`).send({ decision: 'APPROUVE' });
    expect(early.status).toBe(409); expect(early.body.error.code).toBe('MANAGER_REVIEW_PENDING');
    const m = await login('mgr@t.ci');
    const list = await m.get('/api/leaves?scope=team');
    expect(list.body.items.find((l: any) => l.id === leaveId).canManagerReview).toBe(true);
    expect((await m.post(`/api/leaves/${leaveId}/decide`).send({ decision: 'APPROUVE' })).status).toBe(403);
    const r = await m.post(`/api/leaves/${leaveId}/manager-review`).send({ decision: 'FAVORABLE', comment: 'OK pour moi' });
    expect(r.body.status).toBe('EN_ATTENTE');
  });
  it('§15.15-16 les RH valident ; la période est prise en compte (congé, pointage signalé)', async () => {
    const rh = await login('rh@t.ci');
    expect((await rh.post(`/api/leaves/${leaveId}/decide`).send({ decision: 'APPROUVE', comment: 'Validé' })).status).toBe(200);
    const e = await login('E1');
    expect((await e.get('/api/notifications')).body.items.some((x: any) => x.type === 'DEMANDE_APPROUVEE')).toBe(true);
    setNow(at('2026-11-26', '09:00'));
    const e2 = await login('E1'); // la session de l'avant-veille a expiré (12 h)
    const st = await e2.get('/api/clock/status');
    expect(st.body.leave.label).toBe('Congé annuel'); expect(st.body.isWorkingDay).toBe(false);
    // add.12 pointage pendant un congé validé : accepté mais signalé
    const r = await scan(e2, 'ARRIVEE', locIn);
    expect(r.status).toBe(200); expect(r.body.warnings.join(' ')).toMatch(/congé/);
    setNow(at('2026-11-28', '09:00'));
    await closeDays({ daysBack: 3 });
    const [d] = await db.select().from(schema.attendances).where(and(eq(schema.attendances.employeeId, ids.E1), eq(schema.attendances.workDate, '2026-11-27')));
    expect(d.dayStatus).toBe('CONGE'); // jamais « absence injustifiée »
  });
});

describe('Heures supplémentaires, rapports, exports, sauvegarde', () => {
  it('validation des HS par les RH, plafonnée aux minutes constatées', async () => {
    const rh = await login('rh@t.ci');
    const list = await rh.get('/api/overtime?status=EN_ATTENTE');
    const o = list.body.items[0];
    expect((await rh.post(`/api/overtime/${o.id}/decide`).send({ status: 'VALIDE', validatedMinutes: o.potentialMinutes + 10 })).status).toBe(400);
    expect((await rh.post(`/api/overtime/${o.id}/decide`).send({ status: 'VALIDE', validatedMinutes: Math.min(30, o.potentialMinutes) })).status).toBe(200);
  });
  it('§15.20-21 rapport mensuel JSON + export Excel, PDF et CSV', async () => {
    const rh = await login('rh@t.ci');
    const j = await rh.get('/api/reports/monthly?from=2026-11-01&to=2026-11-30');
    expect(j.status).toBe(200); expect(j.body.rows.length).toBeGreaterThan(0);
    const x = await rh.get('/api/reports/monthly?from=2026-11-01&to=2026-11-30&format=xlsx').buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); });
    expect(x.status).toBe(200); expect((x.body as Buffer).subarray(0, 2).toString()).toBe('PK');
    const p = await rh.get('/api/reports/late?from=2026-11-01&to=2026-11-30&format=pdf').buffer(true).parse((res, cb) => { const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); });
    expect((p.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    const c = await rh.get('/api/reports/absences?from=2026-11-01&to=2026-11-30&format=csv');
    expect(c.text).toMatch(/Matricule/);
    for (const t of ['daily', 'weekly', 'leaves', 'overtime', 'department', 'anomalies']) expect((await rh.get(`/api/reports/${t}?from=2026-11-01&to=2026-11-30`)).status).toBe(200);
    expect((await rh.get(`/api/reports/employee?from=2026-11-01&to=2026-11-30&employeeId=${ids.E1}`)).status).toBe(200);
  });
  it('tableau de bord calculé sur les vraies données', async () => {
    const rh = await login('rh@t.ci');
    const k = await rh.get('/api/dashboard/kpis?date=2026-11-17');
    expect(k.body.presentToday).toBeGreaterThanOrEqual(3); expect(k.body.lateToday).toBeGreaterThanOrEqual(2);
    const c = await rh.get('/api/dashboard/charts?from=2026-11-16&to=2026-11-20');
    expect(c.body.presenceDaily.length).toBeGreaterThan(0);
  });
  it('§15.22 les données sont persistantes (nouvelle connexion au pool = mêmes données)', async () => {
    const pg = (await import('pg')).default;
    const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await c.connect();
    const { rows } = await c.query("SELECT count(*)::int AS n FROM attendance_events WHERE result = 'ACCEPTE'");
    await c.end();
    expect(rows[0].n).toBeGreaterThan(15);
  });
});
