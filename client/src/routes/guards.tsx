import * as React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { PageLoader } from '@/components/ui';
import { rolesFor } from '@/components/layout/nav';
import { homePathFor, useAuth } from '@/features/auth/AuthProvider';
import { ForcePasswordChange } from '@/pages/auth/ForcePasswordChange';
import type { Role } from '@/lib/types';

function FullPageLoader() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface">
      <PageLoader label="Chargement de votre espace…" />
    </div>
  );
}

/** Exige une session. Affiche l'écran de changement de mot de passe forcé si nécessaire. */
export function RequireAuth({ children }: { children?: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  if (isLoading) return <FullPageLoader />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (user.mustChangePassword) return <ForcePasswordChange />;
  return <>{children ?? <Outlet />}</>;
}

/** Exige l'un des rôles ; sinon renvoie vers l'accueil du rôle. */
export function RequireRole({ roles, children }: { roles: Role[]; children?: React.ReactNode }) {
  const { user, company } = useAuth();
  if (!user) return null;
  if (!roles.includes(user.role)) return <Navigate to={homePathFor(user, company)} replace />;
  return <>{children ?? <Outlet />}</>;
}

/** Filtre automatique des routes /admin/* selon la config de navigation (nav.ts). */
export function RequireAdminRoute({ children }: { children?: React.ReactNode }) {
  const location = useLocation();
  return <RequireRole roles={rolesFor(location.pathname)}>{children}</RequireRole>;
}

/** L'espace /app exige une fiche employé liée. */
export function RequireEmployee({ children }: { children?: React.ReactNode }) {
  const { user, hasEmployee, company } = useAuth();
  if (!user) return null;
  if (!hasEmployee) return <Navigate to={user.role === 'EMPLOYEE' ? '/login' : homePathFor(user, company)} replace />;
  return <>{children ?? <Outlet />}</>;
}
