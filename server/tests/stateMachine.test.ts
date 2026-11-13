import { describe, it, expect } from 'vitest';
import { transition, allowedActions } from '../src/services/stateMachine';

const noBreak = { breakTracking: false, maxBreaks: 1, breakCount: 0 };
const withBreak = { breakTracking: true, maxBreaks: 1, breakCount: 0 };

describe('machine à états', () => {
  it('NON_POINTE → PRESENT', () => expect(transition('NON_POINTE', 'ARRIVEE', noBreak)).toEqual({ ok: true, next: 'PRESENT' }));
  it('départ sans arrivée refusé', () => expect(transition('NON_POINTE', 'DEPART', noBreak)).toMatchObject({ ok: false, code: 'DEPART_SANS_ARRIVEE' }));
  it('double arrivée refusée', () => expect(transition('PRESENT', 'ARRIVEE', noBreak)).toMatchObject({ ok: false, code: 'DOUBLE_ARRIVEE' }));
  it('PRESENT → PARTI', () => expect(transition('PRESENT', 'DEPART', noBreak)).toEqual({ ok: true, next: 'PARTI' }));
  it('double départ refusé', () => expect(transition('PARTI', 'DEPART', noBreak)).toMatchObject({ ok: false, code: 'DOUBLE_DEPART' }));
  it('arrivée après départ refusée', () => expect(transition('PARTI', 'ARRIVEE', noBreak)).toMatchObject({ ok: false, code: 'ARRIVEE_APRES_DEPART' }));
  it('pause refusée si non activée', () => expect(transition('PRESENT', 'PAUSE_DEBUT', noBreak)).toMatchObject({ ok: false, code: 'PAUSE_NON_AUTORISEE' }));
  it('cycle de pause complet', () => {
    expect(transition('PRESENT', 'PAUSE_DEBUT', withBreak)).toEqual({ ok: true, next: 'EN_PAUSE' });
    expect(transition('EN_PAUSE', 'DEPART', withBreak)).toMatchObject({ ok: false, code: 'PAUSE_EN_COURS' });
    expect(transition('EN_PAUSE', 'PAUSE_FIN', withBreak)).toEqual({ ok: true, next: 'DE_RETOUR_DE_PAUSE' });
    expect(transition('DE_RETOUR_DE_PAUSE', 'PAUSE_DEBUT', { ...withBreak, breakCount: 1 })).toMatchObject({ ok: false, code: 'MAX_PAUSES_ATTEINT' });
    expect(transition('DE_RETOUR_DE_PAUSE', 'DEPART', withBreak)).toEqual({ ok: true, next: 'PARTI' });
  });
  it('journée clôturée : tout refusé', () => {
    expect(allowedActions('POINTAGE_INCOMPLET', withBreak)).toEqual([]);
    expect(allowedActions('ANOMALIE', withBreak)).toEqual([]);
  });
  it('actions autorisées', () => {
    expect(allowedActions('NON_POINTE', noBreak)).toEqual(['ARRIVEE']);
    expect(allowedActions('PRESENT', withBreak)).toEqual(['DEPART', 'PAUSE_DEBUT']);
  });
});
