import { describe, it, expect } from 'vitest';
import { makeQrPayload, verifyQrPayload, currentWindow, locationAllows } from '../src/services/qr';

const S = 'test-secret-0123456789abcdef';
const now = Date.UTC(2026, 10, 16, 8, 0, 0);
const rot = () => 30;

describe('QR signés', () => {
  const body = { c: 1, l: 1, t: 'ENTREE' as const, v: 1, m: 'D' as const, w: currentWindow(30, now) };
  it('code valide', () => expect(verifyQrPayload(makeQrPayload(body, S), S, rot, now)).toMatchObject({ ok: true }));
  it('fenêtre précédente tolérée', () => expect(verifyQrPayload(makeQrPayload(body, S), S, rot, now + 30_000)).toMatchObject({ ok: true }));
  it('code expiré', () => expect(verifyQrPayload(makeQrPayload(body, S), S, rot, now + 90_000)).toMatchObject({ ok: false, code: 'QR_EXPIRED' }));
  it('code falsifié (corps modifié)', () => {
    const p = makeQrPayload(body, S).split('.');
    const forged = Buffer.from(JSON.stringify({ ...body, t: 'SORTIE' })).toString('base64url');
    expect(verifyQrPayload(`PRH1.${forged}.${p[2]}`, S, rot, now)).toMatchObject({ ok: false, code: 'QR_INVALID' });
  });
  it('mauvaise clé', () => expect(verifyQrPayload(makeQrPayload(body, 'autre-secret-xxxxxxxxxxxx'), S, rot, now)).toMatchObject({ ok: false, code: 'QR_INVALID' }));
  it('texte quelconque', () => expect(verifyQrPayload('https://example.com', S, rot, now)).toMatchObject({ ok: false, code: 'QR_INVALID' }));
  it('statique sans expiration', () => {
    const s = { ...body, m: 'S' as const, w: 0 };
    expect(verifyQrPayload(makeQrPayload(s, S), S, rot, now + 1e10)).toMatchObject({ ok: true });
  });
  it('compatibilité type/action', () => {
    expect(locationAllows('ENTREE', 'ARRIVEE')).toBe(true);
    expect(locationAllows('ENTREE', 'DEPART')).toBe(false);
    expect(locationAllows('SORTIE', 'DEPART')).toBe(true);
    expect(locationAllows('MIXTE', 'DEPART')).toBe(true);
  });
});
