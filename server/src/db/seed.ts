/**
 * Initialisation des données.
 *   npm run seed -- --minimal   → installation réelle : rôles, permissions, types de congés, super administrateur
 *                                 (l'assistant de configuration reste à faire, aucune donnée fictive).
 *   npm run seed                → base de DÉMONSTRATION : données fictives clairement identifiées
 *                                 (matricules DEMO-xxx, emails @demo.local, employés marqués is_demo).
 */
import bcrypt from 'bcryptjs';
import { eq, sql } from 'drizzle-orm';
import { db, pool, schema } from './index.js';
import { runMigrations } from './migrate.js';
import { PERMISSIONS } from '../middlewares/auth.js';
import { randomToken } from '../services/qr.js';
import { recomputeAttendance, closeDays } from '../services/attendance.js';
import { loadScheduleResolver, toRules } from '../services/schedule.js';
import { isScheduledWorkDay, shiftBounds } from '../services/calc.js';
import { addDays, localDate } from '../utils/time.js';
import { clearSettingsCache } from '../services/settings.js';

const minimal = process.argv.includes('--minimal');
const TZ = 'Africa/Abidjan';

async function base() {
  await db.insert(schema.roles).values([
    { code: 'SUPER_ADMIN', label: 'Super administrateur', description: 'Tous les droits, paramètres techniques, audit, sauvegardes' },
    { code: 'HR_ADMIN', label: 'Administrateur RH', description: 'Gestion quotidienne du personnel, présences, congés, rapports' },
    { code: 'MANAGER', label: 'Responsable de département', description: 'Suivi de son équipe et avis sur les demandes' },
    { code: 'EMPLOYEE', label: 'Employé', description: 'Pointage et espace personnel' },
  ]).onConflictDoNothing();
  const perms = [...new Set(Object.values(PERMISSIONS).flat())];
  await db.insert(schema.permissions).values(perms.map((code) => ({ code, label: code }))).onConflictDoNothing();
  for (const [role, list] of Object.entries(PERMISSIONS)) {
    await db.insert(schema.rolePermissions).values(list.map((permission) => ({ role: role as any, permission }))).onConflictDoNothing();
  }
  await db.insert(schema.leaveTypes).values([
    { code: 'CONGE_ANNUEL', label: 'Congé annuel', category: 'CONGE', paid: true, requiresHrValidation: true, color: '#2563EB' },
    { code: 'PERMISSION', label: 'Permission exceptionnelle', category: 'PERMISSION', paid: true, requiresHrValidation: true, color: '#F59E0B' },
    { code: 'EVENEMENT_FAMILIAL', label: 'Événement familial', category: 'PERMISSION', paid: true, requiresJustification: true, color: '#8B5CF6' },
    { code: 'MALADIE', label: 'Absence maladie', category: 'MALADIE', paid: true, requiresJustification: true, color: '#DC2626' },
    { code: 'MISSION', label: 'Mission professionnelle', category: 'MISSION', paid: true, requiresHrValidation: false, color: '#16A34A' },
    { code: 'SANS_SOLDE', label: 'Congé sans solde', category: 'CONGE', paid: false, requiresHrValidation: true, color: '#64748B' },
  ]).onConflictDoNothing();
  // Jours fériés à date fixe en Côte d'Ivoire (récurrents). Les fêtes mobiles (Pâques, Ascension, Pentecôte,
  // Ramadan, Tabaski, Maouloud, lendemain de l'Assomption…) doivent être ajoutées chaque année par l'administrateur.
  await db.insert(schema.holidays).values([
    { date: '2026-01-01', label: 'Jour de l\'An', recurring: true }, { date: '2026-05-01', label: 'Fête du Travail', recurring: true },
    { date: '2026-08-07', label: 'Fête de l\'Indépendance', recurring: true }, { date: '2026-08-15', label: 'Assomption', recurring: true },
    { date: '2026-11-01', label: 'Toussaint', recurring: true }, { date: '2026-11-15', label: 'Journée nationale de la Paix', recurring: true },
    { date: '2026-12-25', label: 'Noël', recurring: true },
  ]).onConflictDoNothing();
}

async function superAdmin(login: string, password: string, mustChange: boolean) {
  const [exists] = await db.select().from(schema.users).where(sql`lower(${schema.users.login}) = lower(${login})`);
  if (exists) return exists;
  const [u] = await db.insert(schema.users).values({ login, passwordHash: await bcrypt.hash(password, 12), role: 'SUPER_ADMIN', mustChangePassword: mustChange }).returning();
  return u;
}

async function minimalSeed() {
  await base();
  const [c] = await db.select().from(schema.companies);
  if (!c) await db.insert(schema.companies).values({ name: 'Mon entreprise', timezone: TZ, currency: 'XOF' });
  const pw = process.env.ADMIN_INITIAL_PASSWORD || 'ChangezMoi2026';
  await superAdmin(process.env.ADMIN_LOGIN || 'admin', pw, true);
  console.log(`Installation initialisée. Connexion : ${process.env.ADMIN_LOGIN || 'admin'} / ${pw} (changement obligatoire à la première connexion).`);
}

/* ---------------------------------------------------------------- DÉMO */
// générateur pseudo-aléatoire déterministe (démo reproductible)
let seed = 42;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

async function demoSeed() {
  const [already] = await db.select().from(schema.employees).where(eq(schema.employees.isDemo, true)).limit(1);
  if (already) { console.log('Données de démonstration déjà présentes.'); return; }
  await base();
  const today = localDate(new Date(), TZ);
  const start = addDays(today, -35);
  await db.delete(schema.companies);
  await db.insert(schema.companies).values({ name: 'Société Démo Abidjan (fictive)', legalName: 'SDA SARL — données de démonstration', address: 'Plateau, Abidjan, Côte d\'Ivoire',
    phone: '+225 27 00 00 00 00', email: 'contact@demo.local', timezone: TZ, currency: 'XOF', openingTime: '07:30', closingTime: '18:30',
    setupCompleted: true, clockingEnabled: true, activatedAt: new Date(`${start}T00:00:00Z`) });
  clearSettingsCache();

  const deps = await db.insert(schema.departments).values([
    { name: 'Direction générale', code: 'DG' }, { name: 'Ressources humaines', code: 'RH' }, { name: 'Finance & Comptabilité', code: 'FIN' },
    { name: 'Commercial', code: 'COM' }, { name: 'Logistique', code: 'LOG' }, { name: 'Informatique', code: 'IT' },
  ]).returning();
  const dep = (code: string) => deps.find((d) => d.code === code)!.id;
  const posRows = await db.insert(schema.positions).values([
    { title: 'Directeur général', departmentId: dep('DG') }, { title: 'Responsable RH', departmentId: dep('RH') }, { title: 'Chargé RH', departmentId: dep('RH') },
    { title: 'Comptable', departmentId: dep('FIN') }, { title: 'Responsable commercial', departmentId: dep('COM') }, { title: 'Commercial terrain', departmentId: dep('COM') },
    { title: 'Chef d\'entrepôt', departmentId: dep('LOG') }, { title: 'Magasinier', departmentId: dep('LOG') }, { title: 'Agent de sécurité', departmentId: dep('LOG') },
    { title: 'Développeur', departmentId: dep('IT') }, { title: 'Technicien support', departmentId: dep('IT') },
  ]).returning();
  const pos = (t: string) => posRows.find((p) => p.title === t)!.id;

  const [std] = await db.insert(schema.schedules).values({ name: 'Horaire standard', description: 'Bureaux : lundi–vendredi, 8 h–17 h', isDefault: true }).returning();
  const [logi] = await db.insert(schema.schedules).values({ name: 'Horaire logistique', description: 'Entrepôt : 7 h–16 h, pauses pointées, samedi matin inclus' }).returning();
  const [night] = await db.insert(schema.schedules).values({ name: 'Équipe de nuit', description: 'Sécurité : 22 h–6 h' }).returning();
  await db.insert(schema.scheduleVersions).values([
    { scheduleId: std.id, effectiveFrom: '2026-01-01', startTime: '08:00', endTime: '17:00', breakStart: '12:00', breakEnd: '13:00', workDays: [1, 2, 3, 4, 5], dailyMinutes: 480, lateToleranceMin: 10, earlyLeaveToleranceMin: 0, overtimeThresholdMin: 15 },
    { scheduleId: logi.id, effectiveFrom: '2026-01-01', startTime: '07:00', endTime: '16:00', breakStart: '12:00', breakEnd: '13:00', workDays: [1, 2, 3, 4, 5, 6], dailyMinutes: 480, lateToleranceMin: 5, earlyLeaveToleranceMin: 0, overtimeThresholdMin: 15, breakTracking: true, maxBreaks: 2 },
    { scheduleId: night.id, effectiveFrom: '2026-01-01', startTime: '22:00', endTime: '06:00', breakStart: '02:00', breakEnd: '02:30', workDays: [1, 2, 3, 4, 5], dailyMinutes: 450, lateToleranceMin: 10, overtimeThresholdMin: 15 },
  ]);
  await db.insert(schema.scheduleAssignments).values({ scheduleId: logi.id, departmentId: dep('LOG'), effectiveFrom: '2026-01-01' });

  const pw = await bcrypt.hash('Demo2026!', 10);
  const people: [string, string, string, string, string, 'SUPER_ADMIN' | 'HR_ADMIN' | 'MANAGER' | 'EMPLOYEE', 'M' | 'F'][] = [
    ['DEMO-001', 'Kouassi', 'Aya Danielle', 'DG', 'Directeur général', 'SUPER_ADMIN', 'F'],
    ['DEMO-002', 'Bamba', 'Mariam', 'RH', 'Responsable RH', 'HR_ADMIN', 'F'],
    ['DEMO-003', 'Yao', 'Koffi Jean', 'COM', 'Responsable commercial', 'MANAGER', 'M'],
    ['DEMO-004', 'Traoré', 'Ibrahim', 'COM', 'Commercial terrain', 'EMPLOYEE', 'M'],
    ['DEMO-005', 'N\'Guessan', 'Adjoua Estelle', 'COM', 'Commercial terrain', 'EMPLOYEE', 'F'],
    ['DEMO-006', 'Koné', 'Seydou', 'LOG', 'Chef d\'entrepôt', 'MANAGER', 'M'],
    ['DEMO-007', 'Diabaté', 'Moussa', 'LOG', 'Magasinier', 'EMPLOYEE', 'M'],
    ['DEMO-008', 'Ouattara', 'Fatoumata', 'LOG', 'Magasinier', 'EMPLOYEE', 'F'],
    ['DEMO-009', 'Gbagbo', 'Serge Arnaud', 'LOG', 'Agent de sécurité', 'EMPLOYEE', 'M'],
    ['DEMO-010', 'Kacou', 'Brice', 'IT', 'Développeur', 'EMPLOYEE', 'M'],
    ['DEMO-011', 'Aké', 'Christelle', 'IT', 'Technicien support', 'EMPLOYEE', 'F'],
    ['DEMO-012', 'Coulibaly', 'Awa', 'FIN', 'Comptable', 'EMPLOYEE', 'F'],
    ['DEMO-013', 'Assi', 'Marc-Henri', 'RH', 'Chargé RH', 'EMPLOYEE', 'M'],
    ['DEMO-014', 'Djè', 'Rosine', 'FIN', 'Comptable', 'EMPLOYEE', 'F'],
  ];
  const emps: (typeof schema.employees.$inferSelect)[] = [];
  for (const [mat, last, first, d, p, role, g] of people) {
    const email = `${first.split(' ')[0].normalize('NFD').replace(/[^\w]/g, '').toLowerCase()}.${last.normalize('NFD').replace(/[^\w]/g, '').toLowerCase()}@demo.local`;
    const [e] = await db.insert(schema.employees).values({ matricule: mat, lastName: last, firstNames: first, email, phone: '+225 07 00 00 00 ' + mat.slice(-2),
      gender: g, departmentId: dep(d), positionId: pos(p), hireDate: '2024-03-01', contractType: 'CDI', isDemo: true }).returning();
    await db.insert(schema.users).values({ employeeId: e.id, login: email, passwordHash: pw, role, mustChangePassword: false });
    await db.insert(schema.employeeQrCodes).values({ employeeId: e.id, token: randomToken() });
    emps.push(e);
  }
  const byMat = (m: string) => emps.find((e) => e.matricule === m)!;
  await db.update(schema.departments).set({ managerEmployeeId: byMat('DEMO-003').id }).where(eq(schema.departments.id, dep('COM')));
  await db.update(schema.departments).set({ managerEmployeeId: byMat('DEMO-006').id }).where(eq(schema.departments.id, dep('LOG')));
  await db.update(schema.departments).set({ managerEmployeeId: byMat('DEMO-002').id }).where(eq(schema.departments.id, dep('RH')));
  await db.update(schema.departments).set({ managerEmployeeId: byMat('DEMO-001').id }).where(eq(schema.departments.id, dep('DG')));
  for (const m of ['DEMO-004', 'DEMO-005']) await db.update(schema.employees).set({ managerId: byMat('DEMO-003').id }).where(eq(schema.employees.id, byMat(m).id));
  for (const m of ['DEMO-007', 'DEMO-008', 'DEMO-009']) await db.update(schema.employees).set({ managerId: byMat('DEMO-006').id }).where(eq(schema.employees.id, byMat(m).id));
  // agent de sécurité : horaire de nuit individuel (priorité sur le département)
  await db.insert(schema.scheduleAssignments).values({ scheduleId: night.id, employeeId: byMat('DEMO-009').id, effectiveFrom: '2026-01-01' });

  await db.insert(schema.locationQrCodes).values([
    { code: 'QR_ENTREE', label: 'Entrée principale', type: 'ENTREE', mode: 'DYNAMIQUE', rotationSeconds: 30, displayKey: randomToken(24) },
    { code: 'QR_SORTIE', label: 'Sortie principale', type: 'SORTIE', mode: 'DYNAMIQUE', rotationSeconds: 30, displayKey: randomToken(24) },
  ]);
  await superAdmin('admin', 'Admin2026!', false);

  // Congés approuvés (fictifs) pour l'historique
  const lt = await db.select().from(schema.leaveTypes);
  const ltId = (c: string) => lt.find((x) => x.code === c)!.id;
  await db.insert(schema.leaveRequests).values([
    { employeeId: byMat('DEMO-012').id, leaveTypeId: ltId('CONGE_ANNUEL'), startDate: addDays(today, -20), endDate: addDays(today, -16), status: 'APPROUVE', workingDays: 5, comment: 'Congé annuel (démo)', managerDecision: 'FAVORABLE' },
    { employeeId: byMat('DEMO-005').id, leaveTypeId: ltId('MISSION'), startDate: addDays(today, -9), endDate: addDays(today, -8), status: 'APPROUVE', workingDays: 2, comment: 'Mission client à Yamoussoukro (démo)' },
    { employeeId: byMat('DEMO-010').id, leaveTypeId: ltId('CONGE_ANNUEL'), startDate: addDays(today, 7), endDate: addDays(today, 11), status: 'EN_ATTENTE', workingDays: 5, comment: 'Vacances (démo)' },
    { employeeId: byMat('DEMO-011').id, leaveTypeId: ltId('PERMISSION'), startDate: addDays(today, 2), endDate: addDays(today, 2), status: 'EN_ATTENTE', workingDays: 1, comment: 'Démarches administratives (démo)', managerDecision: 'FAVORABLE' },
  ]);

  // Historique de pointage fictif (35 jours)
  const resolve = await loadScheduleResolver();
  const leaves = await db.select().from(schema.leaveRequests).where(eq(schema.leaveRequests.status, 'APPROUVE'));
  const holidays = await db.select().from(schema.holidays);
  const [entree] = await db.select().from(schema.locationQrCodes).where(eq(schema.locationQrCodes.code, 'QR_ENTREE'));
  const [sortie] = await db.select().from(schema.locationQrCodes).where(eq(schema.locationQrCodes.code, 'QR_SORTIE'));
  for (let d = start; d < today; d = addDays(d, 1)) {
    if (holidays.some((h) => h.date.slice(5) === d.slice(5))) continue;
    for (const e of emps) {
      const r = resolve(e, d);
      if (!r || !isScheduledWorkDay(d, toRules(r.version))) continue;
      if (leaves.some((l) => l.employeeId === e.id && l.startDate <= d && l.endDate >= d)) continue;
      const x = rnd();
      if (x < 0.04) continue; // absence
      const b = shiftBounds(d, toRules(r.version), TZ);
      const lateMin = x < 0.18 ? Math.round(12 + rnd() * 40) : Math.round(-20 + rnd() * 28);
      const arrival = new Date(b.start.getTime() + lateMin * 60000 + Math.round(rnd() * 59) * 1000);
      const forgot = rnd() < 0.03;
      const extra = rnd() < 0.2 ? Math.round(30 + rnd() * 100) : rnd() < 0.1 ? -Math.round(20 + rnd() * 60) : Math.round(rnd() * 12);
      const departure = forgot ? null : new Date(b.end.getTime() + extra * 60000);
      await db.transaction(async (tx) => {
        const [att] = await tx.insert(schema.attendances).values({ employeeId: e.id, workDate: d, scheduleVersionId: r.version.id, state: departure ? 'PARTI' : 'PRESENT', arrivalAt: arrival, departureAt: departure }).returning();
        await tx.insert(schema.attendanceEvents).values({ attendanceId: att.id, employeeId: e.id, workDate: d, type: 'ARRIVEE', serverTime: arrival, locationQrId: entree.id, result: 'ACCEPTE', meta: { demo: true } });
        if (departure) await tx.insert(schema.attendanceEvents).values({ attendanceId: att.id, employeeId: e.id, workDate: d, type: 'DEPART', serverTime: departure, locationQrId: sortie.id, result: 'ACCEPTE', meta: { demo: true } });
        if (r.version.breakTracking && departure) {
          const bs = new Date(b.breakInterval!.start.getTime() + Math.round(rnd() * 15) * 60000);
          await tx.insert(schema.attendanceBreaks).values({ attendanceId: att.id, startAt: bs, endAt: new Date(bs.getTime() + (50 + Math.round(rnd() * 20)) * 60000) });
          await tx.update(schema.attendances).set({ breakCount: 1 }).where(eq(schema.attendances.id, att.id));
        }
        await recomputeAttendance(tx, att.id);
      });
    }
  }
  const res = await closeDays({ daysBack: 36 });
  console.log(`Démo : ${emps.length} employés fictifs, ${res.closed} journées clôturées.`);
  console.log('Comptes de démonstration (mot de passe Demo2026!) :');
  console.log('  Super admin : aya.kouassi@demo.local  (ou admin / Admin2026!)');
  console.log('  Admin RH    : mariam.bamba@demo.local');
  console.log('  Responsable : koffi.yao@demo.local (Commercial) · seydou.kone@demo.local (Logistique)');
  console.log('  Employés    : ibrahim.traore@demo.local, brice.kacou@demo.local, moussa.diabate@demo.local …  ou matricule DEMO-004');
}

(async () => {
  await runMigrations();
  if (minimal) await minimalSeed(); else await demoSeed();
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
