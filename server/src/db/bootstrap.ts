/** Initialisation minimale (installation réelle) — appelée automatiquement au premier démarrage */
import bcrypt from 'bcryptjs';
import { sql } from 'drizzle-orm';
import { db, schema } from './index.js';
import { PERMISSIONS } from '../middlewares/auth.js';

const TZ = 'Africa/Abidjan';

export async function base() {
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

export async function superAdmin(login: string, password: string, mustChange: boolean) {
  const [exists] = await db.select().from(schema.users).where(sql`lower(${schema.users.login}) = lower(${login})`);
  if (exists) return exists;
  const [u] = await db.insert(schema.users).values({ login, passwordHash: await bcrypt.hash(password, 12), role: 'SUPER_ADMIN', mustChangePassword: mustChange }).returning();
  return u;
}

export async function minimalSeed() {
  await base();
  const [c] = await db.select().from(schema.companies);
  if (!c) await db.insert(schema.companies).values({ name: 'Mon entreprise', timezone: TZ, currency: 'XOF' });
  const pw = process.env.ADMIN_INITIAL_PASSWORD || 'ChangezMoi2026';
  await superAdmin(process.env.ADMIN_LOGIN || 'admin', pw, true);
  console.log(`Installation initialisée. Connexion : ${process.env.ADMIN_LOGIN || 'admin'} / ${pw} (changement obligatoire à la première connexion).`);
}


/** Au premier démarrage sur une base vide : rôles, types de congés, entreprise vierge et super administrateur */
export async function bootstrapIfEmpty() {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.users);
  if (n === 0) await minimalSeed();
}
