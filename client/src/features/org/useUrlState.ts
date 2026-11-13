import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

/** Filtres synchronisés avec l'URL (liens partageables, retour navigateur). Toute modification ramène à la page 1. */
export function useUrlState<T extends Record<string, string>>(defaults: T) {
  const [sp, setSp] = useSearchParams();
  const values = useMemo(() => {
    const out = { ...defaults } as Record<string, string>;
    for (const k of Object.keys(defaults)) {
      const v = sp.get(k);
      if (v !== null) out[k] = v;
    }
    return out as T;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);
  const page = Number(sp.get('page') ?? '1') || 1;

  const set = useCallback((patch: Partial<T>, keepPage = false) => {
    setSp((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === '' || v === (defaults as Record<string, string>)[k]) {
          if ((defaults as Record<string, string>)[k] && v === '') next.set(k, '');
          else next.delete(k);
        } else next.set(k, String(v));
      }
      if (!keepPage) next.delete('page');
      return next;
    }, { replace: true });
  }, [setSp, defaults]);

  const setPage = useCallback((p: number) => {
    setSp((prev) => { const n = new URLSearchParams(prev); if (p <= 1) n.delete('page'); else n.set('page', String(p)); return n; }, { replace: true });
  }, [setSp]);

  const reset = useCallback(() => setSp(new URLSearchParams(), { replace: true }), [setSp]);
  const dirty = Object.keys(defaults).some((k) => sp.has(k));
  return { values, set, page, setPage, reset, dirty, searchParams: sp };
}
