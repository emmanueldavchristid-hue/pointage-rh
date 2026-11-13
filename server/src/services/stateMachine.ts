/**
 * Machine à états centralisée du pointage (backend uniquement).
 *
 *   NON_POINTE ──ARRIVEE──▶ PRESENT ──DEPART──▶ PARTI
 *                              │ PAUSE_DEBUT (si pauses pointées)
 *                              ▼
 *                          EN_PAUSE ──PAUSE_FIN──▶ DE_RETOUR_DE_PAUSE ──DEPART──▶ PARTI
 *                                                     └─PAUSE_DEBUT (si pauses restantes)─▶ EN_PAUSE
 *   POINTAGE_INCOMPLET / ANOMALIE : journée clôturée → seule une correction administrative la modifie.
 */
export type State = 'NON_POINTE' | 'PRESENT' | 'EN_PAUSE' | 'DE_RETOUR_DE_PAUSE' | 'PARTI' | 'POINTAGE_INCOMPLET' | 'ANOMALIE';
export type Action = 'ARRIVEE' | 'DEPART' | 'PAUSE_DEBUT' | 'PAUSE_FIN';
export const ACTIONS: Action[] = ['ARRIVEE', 'DEPART', 'PAUSE_DEBUT', 'PAUSE_FIN'];

export interface TransitionCtx { breakTracking: boolean; maxBreaks: number; breakCount: number }
export type TransitionResult = { ok: true; next: State } | { ok: false; code: string; message: string };

const err = (code: string, message: string): TransitionResult => ({ ok: false, code, message });

export function transition(state: State, action: Action, ctx: TransitionCtx): TransitionResult {
  const canBreak = ctx.breakTracking && ctx.breakCount < ctx.maxBreaks;
  switch (state) {
    case 'NON_POINTE':
      if (action === 'ARRIVEE') return { ok: true, next: 'PRESENT' };
      if (action === 'DEPART') return err('DEPART_SANS_ARRIVEE', "Départ refusé : aucune arrivée n'a été enregistrée aujourd'hui.");
      return err('TRANSITION_INVALIDE', "Vous devez d'abord pointer votre arrivée.");
    case 'PRESENT':
      if (action === 'ARRIVEE') return err('DOUBLE_ARRIVEE', 'Votre arrivée a déjà été enregistrée aujourd\'hui.');
      if (action === 'DEPART') return { ok: true, next: 'PARTI' };
      if (action === 'PAUSE_DEBUT') {
        if (!ctx.breakTracking) return err('PAUSE_NON_AUTORISEE', "Le pointage des pauses n'est pas activé pour votre horaire.");
        if (!canBreak) return err('MAX_PAUSES_ATTEINT', 'Nombre maximal de pauses atteint pour aujourd\'hui.');
        return { ok: true, next: 'EN_PAUSE' };
      }
      return err('AUCUNE_PAUSE_EN_COURS', "Aucune pause n'est en cours.");
    case 'EN_PAUSE':
      if (action === 'PAUSE_FIN') return { ok: true, next: 'DE_RETOUR_DE_PAUSE' };
      if (action === 'ARRIVEE') return err('DOUBLE_ARRIVEE', 'Votre arrivée a déjà été enregistrée aujourd\'hui.');
      return err('PAUSE_EN_COURS', 'Une pause est en cours : pointez d\'abord votre retour de pause.');
    case 'DE_RETOUR_DE_PAUSE':
      if (action === 'DEPART') return { ok: true, next: 'PARTI' };
      if (action === 'ARRIVEE') return err('DOUBLE_ARRIVEE', 'Votre arrivée a déjà été enregistrée aujourd\'hui.');
      if (action === 'PAUSE_DEBUT') {
        if (!canBreak) return err('MAX_PAUSES_ATTEINT', 'Nombre maximal de pauses atteint pour aujourd\'hui.');
        return { ok: true, next: 'EN_PAUSE' };
      }
      return err('AUCUNE_PAUSE_EN_COURS', "Aucune pause n'est en cours.");
    case 'PARTI':
      if (action === 'DEPART') return err('DOUBLE_DEPART', 'Votre départ a déjà été enregistré aujourd\'hui.');
      if (action === 'ARRIVEE') return err('ARRIVEE_APRES_DEPART', 'Votre départ définitif est déjà enregistré. Contactez les RH pour une régularisation.');
      return err('TRANSITION_INVALIDE', 'Votre journée est terminée.');
    default:
      return err('TRANSITION_INVALIDE', 'Cette journée est clôturée. Une régularisation doit être demandée aux RH.');
  }
}

export function allowedActions(state: State, ctx: TransitionCtx): Action[] {
  return ACTIONS.filter((a) => transition(state, a, ctx).ok);
}
