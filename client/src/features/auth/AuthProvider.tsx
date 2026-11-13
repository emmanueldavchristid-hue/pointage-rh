import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, setUnauthorizedHandler } from '@/lib/api';
import { setCurrency, setTimezone } from '@/lib/format';
import type { Company, MeResponse, Role, User } from '@/lib/types';
import { authKeys, fetchMe } from './api';

const BRAND_KEY = 'pointage-rh.brand';

export interface AuthContextValue {
  user: User | null;
  company: Company | null;
  permissions: string[];
  role: Role | null;
  /** true pendant le tout premier chargement de /auth/me. */
  isLoading: boolean;
  /** Erreur non-401 de /auth/me (serveur injoignable…). */
  error: unknown;
  isAuthenticated: boolean;
  hasRole: (...roles: Role[]) => boolean;
  can: (permission: string) => boolean;
  /** true si l'utilisateur a une fiche employé liée (accès à /app). */
  hasEmployee: boolean;
  refresh: () => Promise<unknown>;
  logout: () => Promise<void>;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

/** Marque mémorisée localement pour l'écran de connexion (nom/logo issus de l'API). */
export function getCachedBrand(): { name: string; logoUrl: string | null } | null {
  try {
    const raw = localStorage.getItem(BRAND_KEY);
    return raw ? (JSON.parse(raw) as { name: string; logoUrl: string | null }) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: authKeys.me,
    queryFn: fetchMe,
    staleTime: 5 * 60_000,
    retry: false,
    meta: { silent: true },
  });

  const data: MeResponse | null = query.data ?? null;

  React.useEffect(() => {
    if (data?.company) {
      setTimezone(data.company.timezone);
      setCurrency(data.company.currency);
      try {
        localStorage.setItem(BRAND_KEY, JSON.stringify({ name: data.company.name, logoUrl: data.company.logoUrl }));
      } catch { /* stockage indisponible */ }
    }
  }, [data?.company]);

  // 401 sur n'importe quel appel → session vidée ; RequireAuth redirige vers /login.
  React.useEffect(() => {
    setUnauthorizedHandler(() => {
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'auth' });
      qc.setQueryData(authKeys.me, null);
    });
    return () => setUnauthorizedHandler(null);
  }, [qc]);

  const logout = React.useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch { /* on déconnecte localement quoi qu'il arrive */ }
    qc.clear();
    qc.setQueryData(authKeys.me, null);
  }, [qc]);

  const value = React.useMemo<AuthContextValue>(() => {
    const user = data?.user ?? null;
    const permissions = data?.permissions ?? [];
    return {
      user,
      company: data?.company ?? null,
      permissions,
      role: user?.role ?? null,
      isLoading: query.isPending,
      error: query.error,
      isAuthenticated: !!user,
      hasRole: (...roles) => !!user && roles.includes(user.role),
      can: (p) => permissions.includes(p),
      hasEmployee: !!user?.employee,
      refresh: () => query.refetch(),
      logout,
    };
  }, [data, query.isPending, query.error, query.refetch, logout]); // eslint-disable-line react-hooks/exhaustive-deps

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>');
  return ctx;
}

/** Page d'accueil selon le rôle. */
export function homePathFor(user: User | null, company: Company | null): string {
  if (!user) return '/login';
  if (user.role === 'EMPLOYEE') return '/app';
  if (user.role === 'SUPER_ADMIN' && company && !company.setupCompleted) return '/admin/setup';
  return '/admin';
}

/** Nom affichable d'un utilisateur. */
export function displayName(user: User | null): string {
  if (!user) return '';
  if (user.employee) return `${user.employee.firstNames} ${user.employee.lastName}`.trim();
  return user.login;
}
