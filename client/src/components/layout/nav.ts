import {
  AlertTriangle, Archive, BarChart3, Building2, CalendarCheck, CalendarClock, CalendarDays, CalendarOff, Clock,
  FileClock, Fingerprint, LayoutDashboard, QrCode, Radio, Settings, Timer, UserCog, Users, type LucideIcon,
} from 'lucide-react';
import type { Role } from '@/lib/types';

export interface NavItem { label: string; to: string; icon: LucideIcon; roles: Role[] }
export interface NavSection { title: string; items: NavItem[] }

const ALL_ADMIN: Role[] = ['SUPER_ADMIN', 'HR_ADMIN', 'MANAGER'];
const HR: Role[] = ['SUPER_ADMIN', 'HR_ADMIN'];
const SUPER: Role[] = ['SUPER_ADMIN'];

/** Source unique de la navigation admin ET des droits d'accès aux routes /admin/*. */
export const ADMIN_NAV: NavSection[] = [
  {
    title: 'Pilotage',
    items: [
      { label: 'Tableau de bord', to: '/admin', icon: LayoutDashboard, roles: ALL_ADMIN },
      { label: 'Présences du jour', to: '/admin/live', icon: Radio, roles: ALL_ADMIN },
      { label: 'Anomalies', to: '/admin/anomalies', icon: AlertTriangle, roles: ALL_ADMIN },
    ],
  },
  {
    title: 'Personnel',
    items: [
      { label: 'Employés', to: '/admin/employees', icon: Users, roles: ALL_ADMIN },
      { label: 'Départements & postes', to: '/admin/departments', icon: Building2, roles: HR },
    ],
  },
  {
    title: 'Temps',
    items: [
      { label: 'Pointages', to: '/admin/attendance', icon: Fingerprint, roles: HR },
      { label: 'Absences', to: '/admin/absences', icon: CalendarOff, roles: ALL_ADMIN },
      { label: 'Congés', to: '/admin/leaves', icon: CalendarCheck, roles: ALL_ADMIN },
      { label: 'Heures sup.', to: '/admin/overtime', icon: Timer, roles: ALL_ADMIN },
      { label: 'Horaires', to: '/admin/schedules', icon: CalendarClock, roles: HR },
      { label: 'Jours fériés', to: '/admin/holidays', icon: CalendarDays, roles: HR },
    ],
  },
  {
    title: 'Analyse',
    items: [{ label: 'Rapports', to: '/admin/reports', icon: BarChart3, roles: ALL_ADMIN }],
  },
  {
    title: 'Administration',
    items: [
      { label: 'Paramètres', to: '/admin/settings', icon: Settings, roles: ['SUPER_ADMIN', 'HR_ADMIN'] },
      { label: 'QR Codes & bornes', to: '/admin/locations', icon: QrCode, roles: SUPER },
      { label: 'Utilisateurs', to: '/admin/users', icon: UserCog, roles: SUPER },
      { label: "Journal d'audit", to: '/admin/audit', icon: FileClock, roles: SUPER },
      { label: 'Sauvegardes', to: '/admin/backups', icon: Archive, roles: SUPER },
    ],
  },
];

/** Routes hors menu. */
export const EXTRA_ADMIN_ROUTES: { label: string; to: string; roles: Role[]; section?: string }[] = [
  { label: 'Configuration initiale', to: '/admin/setup', roles: SUPER },
  { label: 'Notifications', to: '/admin/notifications', roles: ALL_ADMIN },
];

export const ADMIN_ROLES = ALL_ADMIN;

/** Rôles autorisés pour une route admin (préfixe le plus long). */
export function rolesFor(path: string): Role[] {
  const all = [
    ...ADMIN_NAV.flatMap((s) => s.items),
    ...EXTRA_ADMIN_ROUTES,
  ];
  const match = all
    .filter((i) => path === i.to || (i.to !== '/admin' && path.startsWith(`${i.to}/`)))
    .sort((a, b) => b.to.length - a.to.length)[0];
  return match?.roles ?? ALL_ADMIN;
}

export function navForRole(role: Role | null): NavSection[] {
  if (!role) return [];
  return ADMIN_NAV.map((s) => ({ ...s, items: s.items.filter((i) => i.roles.includes(role)) })).filter((s) => s.items.length);
}

/** Fil d'Ariane : [section, page, (sous-page)]. */
export function breadcrumbFor(path: string): { section?: string; label: string; to: string; sub?: string } | null {
  for (const s of ADMIN_NAV) {
    for (const i of s.items) {
      if (path === i.to) return { section: s.title, label: i.label, to: i.to };
    }
  }
  for (const s of ADMIN_NAV) {
    for (const i of s.items) {
      if (i.to !== '/admin' && path.startsWith(`${i.to}/`)) return { section: s.title, label: i.label, to: i.to, sub: 'Détail' };
    }
  }
  const extra = EXTRA_ADMIN_ROUTES.find((r) => path === r.to);
  return extra ? { label: extra.label, to: extra.to } : null;
}

export const EMPLOYEE_NAV = [
  { label: 'Accueil', to: '/app', icon: Clock },
  { label: 'Historique', to: '/app/history', icon: FileClock },
  { label: 'Demandes', to: '/app/requests', icon: CalendarCheck },
  { label: 'Calendrier', to: '/app/calendar', icon: CalendarDays },
  { label: 'Profil', to: '/app/profile', icon: UserCog },
] as const;
