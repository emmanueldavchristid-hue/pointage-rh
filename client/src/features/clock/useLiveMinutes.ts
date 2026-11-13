import * as React from 'react';
import type { ClockStatus } from '@/lib/types';

/** États dans lesquels le temps de travail effectif progresse. */
export const isWorkingNow = (s?: ClockStatus | null) =>
  !!s && !!s.arrivalAt && !s.departureAt && (s.state === 'PRESENT' || s.state === 'DE_RETOUR_DE_PAUSE');

/**
 * Temps travaillé « en direct » : valeur serveur + temps écoulé depuis la réception
 * (uniquement si l'employé est présent et hors pause).
 */
export function useLiveMinutes(status: ClockStatus | undefined, receivedAt: number): number {
  const live = isWorkingNow(status);
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!live) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(t);
  }, [live, receivedAt]);
  if (!status) return 0;
  if (!live) return status.workedMinutes;
  return status.workedMinutes + Math.max(0, Math.floor((now - receivedAt) / 60_000));
}
