/** Libellés propres au domaine pointage (complètent @/lib/labels). */
export const EVENT_SOURCE: Record<string, string> = {
  QR_MOBILE: 'QR mobile',
  QR_KIOSK: 'Borne QR',
  KIOSK: 'Borne',
  BADGE: 'Badge personnel',
  KIOSK_BADGE: 'Badge (borne)',
  ADMIN_CORRECTION: 'Correction RH',
  ADMIN_EXCEPTIONNEL: 'Pointage exceptionnel',
  SYSTEME: 'Système',
};

export const EVENT_TYPE: Record<string, string> = {
  ARRIVEE: 'Arrivée',
  DEPART: 'Départ',
  PAUSE_DEBUT: 'Début de pause',
  PAUSE_FIN: 'Fin de pause',
};

export const CORRECTION_FIELD: Record<string, string> = {
  arrivalAt: 'Heure d’arrivée',
  departureAt: 'Heure de départ',
  dayStatus: 'Qualification de la journée',
};

export const fieldLabel = (f: string) => {
  const exc = f.startsWith('EXCEPTIONNEL:');
  const base = exc ? f.slice('EXCEPTIONNEL:'.length) : f;
  return `${CORRECTION_FIELD[base] ?? base}${exc ? ' (exceptionnel)' : ''}`;
};

/** Qualifications de journée acceptées par POST /attendance/:id/correct. */
export const CORRECTABLE_DAY_STATUS = [
  'PRESENT', 'RETARD', 'ABSENCE_NON_JUSTIFIEE', 'ABSENCE_JUSTIFIEE', 'CONGE', 'PERMISSION', 'MISSION', 'FERIE', 'NON_TRAVAILLE', 'INCOMPLET',
] as const;
