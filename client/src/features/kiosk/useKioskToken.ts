import * as React from 'react';
import { api, isApiError } from '@/lib/api';

export interface KioskToken {
  payload: string;
  expiresAt: string | null;
  rotationSeconds: number;
  label: string;
  type: 'ENTREE' | 'SORTIE' | string;
  mode?: string;
  companyName: string;
  logoUrl?: string | null;
  serverTime?: string;
  png: string;
}

export type KioskStatus = 'loading' | 'ok' | 'offline' | 'forbidden' | 'error';

interface State {
  token: KioskToken | null;
  /** Décalage serveur - navigateur (ms). */
  offset: number;
  status: KioskStatus;
  message: string | null;
}

/**
 * Récupère le QR tournant d'une borne, le rafraîchit à son expiration (et au plus tard toutes les rotationSeconds),
 * réessaie automatiquement en cas de perte réseau. S'arrête définitivement sur 403 (clé invalide / révoquée).
 */
export function useKioskToken(code: string | undefined, key: string | null) {
  const [state, setState] = React.useState<State>({ token: null, offset: 0, status: 'loading', message: null });
  const offsetRef = React.useRef(0);
  const fetchNowRef = React.useRef<() => void>(() => undefined);

  React.useEffect(() => {
    if (!code || !key) {
      setState((s) => ({ ...s, status: 'forbidden', message: "L'adresse de cette borne est incomplète : la clé d'affichage est absente." }));
      return;
    }
    let timer: number | undefined;
    let ctrl: AbortController | null = null;
    let stopped = false;
    let failures = 0;

    const schedule = (ms: number) => {
      window.clearTimeout(timer);
      if (!stopped) timer = window.setTimeout(load, ms);
    };

    async function load() {
      ctrl?.abort();
      ctrl = new AbortController();
      const t0 = Date.now();
      try {
        const tok = await api.get<KioskToken>(`/kiosk/${encodeURIComponent(code!)}/token`, { k: key! }, ctrl.signal);
        if (stopped) return;
        const t1 = Date.now();
        if (tok.serverTime) offsetRef.current = new Date(tok.serverTime).getTime() + (t1 - t0) / 2 - t1;
        failures = 0;
        setState({ token: tok, offset: offsetRef.current, status: 'ok', message: null });
        const rotationMs = Math.max(5, tok.rotationSeconds || 30) * 1000;
        const exp = tok.expiresAt ? new Date(tok.expiresAt).getTime() - (Date.now() + offsetRef.current) + 300 : rotationMs;
        schedule(Math.min(Math.max(exp, 1000), rotationMs));
      } catch (e) {
        if (stopped || (e as Error)?.name === 'AbortError') return;
        if (isApiError(e) && (e.status === 403 || e.status === 401)) {
          setState((s) => ({ ...s, token: null, status: 'forbidden', message: e.message }));
          return; // inutile d'insister avec une clé refusée
        }
        failures += 1;
        const offline = !isApiError(e) || e.status === 0 || e.status >= 500;
        setState((s) => ({ ...s, status: offline ? 'offline' : 'error', message: isApiError(e) ? e.message : null }));
        schedule(Math.min(30_000, 3_000 * failures));
      }
    }

    fetchNowRef.current = () => schedule(0);
    const onVisible = () => document.visibilityState === 'visible' && schedule(0);
    const onOnline = () => schedule(0);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    void load();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      ctrl?.abort();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [code, key]);

  return { ...state, retry: () => fetchNowRef.current() };
}

/** Empêche la mise en veille de l'écran tant que la page est visible (API Wake Lock, si disponible). */
export function useWakeLock() {
  React.useEffect(() => {
    type Sentinel = { release: () => Promise<void> };
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<Sentinel> } };
    if (!nav.wakeLock) return;
    let sentinel: Sentinel | null = null;
    let disposed = false;
    const acquire = async () => {
      try {
        if (document.visibilityState !== 'visible') return;
        sentinel = await nav.wakeLock!.request('screen');
        if (disposed) void sentinel.release();
      } catch {
        /* refusé (économie d'énergie, contexte non sécurisé…) */
      }
    };
    const onVisible = () => document.visibilityState === 'visible' && void acquire();
    void acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release().catch(() => undefined);
    };
  }, []);
}

/** Heure serveur, mise à jour chaque seconde. */
export function useServerNow(offset: number, intervalMs = 250) {
  const [now, setNow] = React.useState(() => Date.now() + offset);
  React.useEffect(() => {
    setNow(Date.now() + offset);
    const t = window.setInterval(() => setNow(Date.now() + offset), intervalMs);
    return () => window.clearInterval(t);
  }, [offset, intervalMs]);
  return now;
}
