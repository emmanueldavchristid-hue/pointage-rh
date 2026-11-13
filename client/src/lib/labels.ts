import type { AnomalyStatus, ClockAction, ClockState, DayStatus, LeaveStatus, Role, Severity } from './types';

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'brand' | 'muted';
export interface LabelDef { label: string; tone: Tone }

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Super administrateur',
  HR_ADMIN: 'Administrateur RH',
  MANAGER: 'Responsable',
  EMPLOYEE: 'Employé',
};

export const CLOCK_STATE: Record<ClockState, LabelDef> = {
  NON_POINTE: { label: 'Non pointé', tone: 'muted' },
  PRESENT: { label: 'Présent', tone: 'success' },
  EN_PAUSE: { label: 'En pause', tone: 'warning' },
  DE_RETOUR_DE_PAUSE: { label: 'De retour de pause', tone: 'info' },
  PARTI: { label: 'Parti', tone: 'neutral' },
  POINTAGE_INCOMPLET: { label: 'Pointage incomplet', tone: 'warning' },
  ANOMALIE: { label: 'Anomalie', tone: 'danger' },
};

export const DAY_STATUS: Record<DayStatus, LabelDef> = {
  EN_COURS: { label: 'En cours', tone: 'info' },
  PRESENT: { label: 'Présent', tone: 'success' },
  RETARD: { label: 'Retard', tone: 'warning' },
  ABSENCE_NON_JUSTIFIEE: { label: 'Absence non justifiée', tone: 'danger' },
  ABSENCE_JUSTIFIEE: { label: 'Absence justifiée', tone: 'neutral' },
  CONGE: { label: 'Congé', tone: 'brand' },
  PERMISSION: { label: 'Permission', tone: 'brand' },
  MISSION: { label: 'Mission', tone: 'info' },
  FERIE: { label: 'Jour férié', tone: 'muted' },
  NON_TRAVAILLE: { label: 'Non travaillé', tone: 'muted' },
  INCOMPLET: { label: 'Incomplet', tone: 'warning' },
};

export const LEAVE_STATUS: Record<LeaveStatus, LabelDef> = {
  BROUILLON: { label: 'Brouillon', tone: 'muted' },
  EN_ATTENTE: { label: 'En attente', tone: 'warning' },
  APPROUVE: { label: 'Approuvé', tone: 'success' },
  REFUSE: { label: 'Refusé', tone: 'danger' },
  ANNULE: { label: 'Annulé', tone: 'neutral' },
};

export const ANOMALY_STATUS: Record<AnomalyStatus, LabelDef> = {
  OUVERTE: { label: 'Ouverte', tone: 'danger' },
  EN_COURS: { label: 'En cours', tone: 'info' },
  RESOLUE: { label: 'Résolue', tone: 'success' },
  IGNOREE: { label: 'Ignorée', tone: 'muted' },
};

export const SEVERITY: Record<Severity, LabelDef> = {
  FAIBLE: { label: 'Faible', tone: 'neutral' },
  MOYENNE: { label: 'Moyenne', tone: 'warning' },
  ELEVEE: { label: 'Élevée', tone: 'danger' },
  CRITIQUE: { label: 'Critique', tone: 'danger' },
};

/** Statuts de validation (justificatifs, heures sup.). */
export const REVIEW_STATUS: Record<string, LabelDef> = {
  EN_ATTENTE: { label: 'En attente', tone: 'warning' },
  VALIDE: { label: 'Validé', tone: 'success' },
  REJETE: { label: 'Rejeté', tone: 'danger' },
  REFUSE: { label: 'Refusé', tone: 'danger' },
};

export const EMPLOYEE_STATUS: Record<string, LabelDef> = {
  ACTIF: { label: 'Actif', tone: 'success' },
  ACTIVE: { label: 'Actif', tone: 'success' },
  INACTIF: { label: 'Inactif', tone: 'muted' },
  INACTIVE: { label: 'Inactif', tone: 'muted' },
  SUSPENDU: { label: 'Suspendu', tone: 'warning' },
};

export const CLOCK_ACTION: Record<ClockAction, string> = {
  ARRIVEE: 'Arrivée',
  DEPART: 'Départ',
  PAUSE_DEBUT: 'Début de pause',
  PAUSE_FIN: 'Fin de pause',
};

/** Segment d'URL /app/scan/:action → action API. */
export const SCAN_ACTION_SLUGS: Record<string, ClockAction> = {
  arrivee: 'ARRIVEE',
  depart: 'DEPART',
  'pause-debut': 'PAUSE_DEBUT',
  'pause-fin': 'PAUSE_FIN',
};
export const scanSlug = (a: ClockAction) =>
  Object.entries(SCAN_ACTION_SLUGS).find(([, v]) => v === a)?.[0] ?? 'arrivee';

export const LEAVE_DECISION: Record<string, string> = {
  FAVORABLE: 'Avis favorable',
  DEFAVORABLE: 'Avis défavorable',
  APPROUVE: 'Approuver',
  REFUSE: 'Refuser',
};

export const SCHEDULE_SOURCE: Record<string, string> = {
  EMPLOYE: 'Horaire individuel',
  DEPARTEMENT: 'Horaire du département',
  DEFAUT: 'Horaire par défaut',
};

export const GENDER: Record<string, string> = { M: 'Homme', F: 'Femme', H: 'Homme' };

export const CONTRACT_TYPE: Record<string, string> = {
  CDI: 'CDI',
  CDD: 'CDD',
  STAGE: 'Stage',
  INTERIM: 'Intérim',
  CONSULTANT: 'Consultant',
  APPRENTISSAGE: 'Apprentissage',
};

export const REPORT_TYPES: Record<string, string> = {
  daily: 'Rapport journalier',
  weekly: 'Rapport hebdomadaire',
  monthly: 'Rapport mensuel',
  employee: 'Rapport par employé',
  late: 'Retards',
  absences: 'Absences',
  leaves: 'Congés et permissions',
  overtime: 'Heures supplémentaires',
  department: 'Par département',
  anomalies: 'Anomalies',
};

/** Libellé générique : cherche dans un dictionnaire, sinon humanise le code (« EN_ATTENTE » → « En attente »). */
export function labelOf(dict: Record<string, LabelDef | string> | undefined, code?: string | null): string {
  if (!code) return '—';
  const v = dict?.[code];
  if (typeof v === 'string') return v;
  if (v) return v.label;
  const s = code.replace(/_/g, ' ').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
