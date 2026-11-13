/**
 * QR Codes de localisation signés (HMAC-SHA256).
 * Format : PRH1.<base64url(json)>.<signature>
 *  - mode DYNAMIQUE : le code change toutes les `rotationSeconds` (fenêtre temporelle signée) ;
 *    accepté pendant la fenêtre courante et la précédente (tolérance de lecture).
 *  - mode STATIQUE : imprimable, sans expiration ; invalidable en incrémentant secretVersion.
 */
import crypto from 'node:crypto';

export interface QrBody { c: number; l: number; t: 'ENTREE' | 'SORTIE' | 'MIXTE'; v: number; m: 'D' | 'S'; w: number }

const b64u = (b: Buffer | string) => Buffer.from(b).toString('base64url');

function sign(body: string, secret: string) {
  return crypto.createHmac('sha256', secret).update(body).digest('base64url').slice(0, 32);
}

export function currentWindow(rotationSeconds: number, now = Date.now()) {
  return Math.floor(now / 1000 / rotationSeconds);
}

export function makeQrPayload(body: QrBody, secret: string) {
  const json = b64u(JSON.stringify(body));
  return `PRH1.${json}.${sign(json, secret)}`;
}

export type QrCheck = { ok: true; body: QrBody } | { ok: false; code: 'QR_INVALID' | 'QR_EXPIRED'; message: string };

/** Vérifie la signature et l'expiration ; les contrôles métier (emplacement actif, version, type…) sont faits par l'appelant */
export function verifyQrPayload(payload: string, secret: string, rotationSecondsOf: (body: QrBody) => number, now = Date.now()): QrCheck {
  const invalid: QrCheck = { ok: false, code: 'QR_INVALID', message: "Ce QR Code n'est pas un code de pointage valide." };
  if (typeof payload !== 'string' || payload.length > 600) return invalid;
  const parts = payload.trim().split('.');
  if (parts.length !== 3 || parts[0] !== 'PRH1') return invalid;
  const expected = sign(parts[1], secret);
  const a = Buffer.from(parts[2]); const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return invalid;
  let body: QrBody;
  try { body = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')); } catch { return invalid; }
  if (!body || typeof body.l !== 'number' || typeof body.c !== 'number') return invalid;
  if (body.m === 'D') {
    const cur = currentWindow(rotationSecondsOf(body), now);
    if (body.w !== cur && body.w !== cur - 1) {
      return { ok: false, code: 'QR_EXPIRED', message: 'Ce QR Code a expiré. Scannez le code actuellement affiché sur la borne.' };
    }
  }
  return { ok: true, body };
}

/** Jeton aléatoire non prévisible (256 bits) pour QR personnels et clés de borne */
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

/** Compatibilité action ↔ type d'emplacement */
export function locationAllows(type: QrBody['t'], action: string) {
  if (type === 'MIXTE') return true;
  if (type === 'ENTREE') return action === 'ARRIVEE' || action === 'PAUSE_FIN';
  return action === 'DEPART' || action === 'PAUSE_DEBUT';
}
