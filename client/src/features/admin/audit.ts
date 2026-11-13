/** Libellés français des actions d'audit (repli sur le code brut). */
export const AUDIT_ACTIONS: Record<string, string> = {
  LOGIN: 'Connexion',
  LOGIN_FAILED: 'Échec de connexion',
  LOGOUT: 'Déconnexion',
  ACCOUNT_LOCKED: 'Compte verrouillé',
  PASSWORD_CHANGED: 'Mot de passe modifié',
  PASSWORD_RESET: 'Mot de passe réinitialisé',
  USER_CREATED: 'Compte créé',
  USER_UPDATED: 'Compte modifié',
  EMPLOYEE_CREATED: 'Employé créé',
  EMPLOYEE_UPDATED: 'Employé modifié',
  EMPLOYEE_DEACTIVATED: 'Employé désactivé',
  EMPLOYEE_REACTIVATED: 'Employé réactivé',
  EMPLOYEE_IMPORTED: 'Import d\'employés',
  EMPLOYEE_PHOTO_UPDATED: 'Photo d\'employé modifiée',
  EMPLOYEE_QR_REGENERATED: 'QR personnel régénéré',
  DEPARTMENT_CREATED: 'Département créé',
  DEPARTMENT_UPDATED: 'Département modifié',
  DEPARTMENT_DELETED: 'Département désactivé',
  POSITION_CREATED: 'Poste créé',
  POSITION_UPDATED: 'Poste modifié',
  ATTENDANCE_CORRECTED: 'Pointage corrigé',
  ATTENDANCE_EXCEPTIONAL: 'Pointage exceptionnel saisi',
  CLOCK_BADGE: 'Pointage de secours par badge',
  ANOMALY_RESOLVED: 'Anomalie traitée',
  ANOMALY_DETECTION_RUN: 'Détection des anomalies relancée',
  LEAVE_CREATED: 'Demande de congé créée',
  LEAVE_SUBMITTED: 'Demande de congé soumise',
  LEAVE_CANCELLED: 'Demande de congé annulée',
  LEAVE_MANAGER_REVIEW: 'Avis du responsable sur un congé',
  LEAVE_REVIEWED: 'Avis du responsable sur un congé',
  LEAVE_DECIDED: 'Décision RH sur un congé',
  LEAVE_TYPE_CREATED: 'Type de congé créé',
  LEAVE_TYPE_UPDATED: 'Type de congé modifié',
  JUSTIFICATION_CREATED: 'Justificatif déposé',
  JUSTIFICATION_REVIEWED: 'Justificatif examiné',
  OVERTIME_DECIDED: 'Décision sur heures sup.',
  SCHEDULE_CREATED: 'Horaire créé',
  SCHEDULE_UPDATED: 'Horaire modifié',
  SCHEDULE_VERSION_SAVED: 'Version d\'horaire enregistrée',
  SCHEDULE_ASSIGNED: 'Horaire affecté',
  SCHEDULE_ASSIGNMENT_CLOSED: 'Affectation d\'horaire clôturée',
  HOLIDAY_CREATED: 'Jour férié ajouté',
  HOLIDAY_DELETED: 'Jour férié supprimé',
  LOCATION_CREATED: 'Emplacement QR créé',
  LOCATION_UPDATED: 'Emplacement QR modifié',
  LOCATION_SECRET_ROTATED: 'Secret QR révoqué et régénéré',
  SETTINGS_COMPANY_UPDATED: 'Paramètres entreprise modifiés',
  SETTINGS_SYSTEM_UPDATED: 'Paramètres système modifiés',
  COMPANY_LOGO_UPDATED: 'Logo modifié',
  SETUP_COMPANY: 'Configuration : entreprise',
  SETUP_SCHEDULE: 'Configuration : horaire',
  SETUP_ACTIVATED: 'Pointage activé',
  SETUP_DEACTIVATED: 'Pointage suspendu',
  CLOCKING_ENABLED: 'Pointage activé',
  CLOCKING_DISABLED: 'Pointage suspendu',
  BACKUP_CREATED: 'Sauvegarde effectuée',
  BACKUP_FAILED: 'Échec de sauvegarde',
  BACKUP_DOWNLOADED: 'Sauvegarde téléchargée',
  DATA_PURGED: 'Purge des données anciennes',
};

const EXPORT_LABEL: Record<string, string> = {
  EMPLOYEES: 'employés', REPORT: 'rapport', ATTENDANCE: 'présences', BADGES: 'badges', LEAVES: 'congés',
};

export function auditLabel(action: string): string {
  if (AUDIT_ACTIONS[action]) return AUDIT_ACTIONS[action];
  if (action.startsWith('EXPORT_')) {
    const rest = action.slice(7);
    const known = EXPORT_LABEL[rest.split('_')[0]];
    return `Export ${known ?? rest.toLowerCase().replace(/_/g, ' ')}`;
  }
  return action;
}

export type AuditTone = 'success' | 'danger' | 'warning' | 'info' | 'neutral';
export function auditTone(action: string): AuditTone {
  if (/FAILED|LOCKED|DEACTIVATED|DELETED|ROTATED|DISABLED|PURGED/.test(action)) return 'danger';
  if (/CORRECTED|EXCEPTIONAL|SETTINGS|SETUP|ROLE/.test(action)) return 'warning';
  if (action.startsWith('EXPORT_') || action === 'LOGIN' || action === 'LOGOUT') return 'info';
  if (/CREATED|ACTIVATED|APPROV/.test(action)) return 'success';
  return 'neutral';
}

/** Aplatit un objet en chemins « a.b.c » → valeur. */
export function flatten(v: unknown, prefix = '', out: Record<string, unknown> = {}): Record<string, unknown> {
  if (v === null || v === undefined || typeof v !== 'object' || Array.isArray(v)) {
    if (prefix) out[prefix] = v;
    return out;
  }
  const entries = Object.entries(v as Record<string, unknown>);
  if (!entries.length && prefix) out[prefix] = {};
  for (const [k, val] of entries) flatten(val, prefix ? `${prefix}.${k}` : k, out);
  return out;
}

export interface DiffRow { path: string; before: unknown; after: unknown; kind: 'added' | 'removed' | 'changed' | 'same' }

export function diff(before: unknown, after: unknown): DiffRow[] {
  const a = flatten(before);
  const b = flatten(after);
  // Si « après » est partiel (mise à jour), on ne compare que les champs qu'il contient.
  const partial = before != null && after != null && typeof after === 'object';
  const keys = (partial ? Object.keys(b) : [...new Set([...Object.keys(a), ...Object.keys(b)])]).sort();
  return keys.map((path) => {
    const inA = path in a;
    const inB = path in b;
    const same = JSON.stringify(a[path]) === JSON.stringify(b[path]);
    return { path, before: a[path], after: b[path], kind: !inA ? 'added' : !inB ? 'removed' : same ? 'same' : 'changed' };
  });
}

const ENTITY_LABELS: Record<string, string> = {
  user: 'Compte', employee: 'Employé', department: 'Département', position: 'Poste', attendance: 'Journée de présence',
  anomaly: 'Anomalie', leave_request: 'Demande de congé', leave_type: 'Type de congé', justification: 'Justificatif',
  overtime: 'Heures sup.', schedule: 'Horaire', schedule_version: "Version d'horaire", schedule_assignment: "Affectation d'horaire",
  holiday: 'Jour férié', location: 'Emplacement QR', settings: 'Paramètres', company: 'Entreprise', backup: 'Sauvegarde', report: 'Rapport',
};

/** « Demande de congé n° 4 », « Rapport monthly »… */
export function auditEntity(entity: string | null, entityId: string | number | null): string | null {
  if (!entity) return null;
  const label = ENTITY_LABELS[entity] ?? entity.replace(/_/g, ' ');
  if (entityId === null || entityId === undefined || entityId === '') return label;
  return /^\d+$/.test(String(entityId)) ? `${label} n° ${entityId}` : `${label} · ${entityId}`;
}
