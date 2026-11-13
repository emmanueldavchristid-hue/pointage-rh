import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Link } from 'react-router-dom';
import { LayoutDashboard } from 'lucide-react';
import { Avatar } from '@/components/ui';
import { displayName, useAuth } from '@/features/auth/AuthProvider';
import { cn } from '@/lib/utils';
import { NotificationBell } from './NotificationBell';
import { EMPLOYEE_NAV } from './nav';

/** Espace employé mobile-first (centré sur desktop). */
export function EmployeeLayout() {
  const { user, company, hasRole } = useAuth();
  const location = useLocation();
  const name = displayName(user);
  const isAdmin = hasRole('SUPER_ADMIN', 'HR_ADMIN', 'MANAGER');

  return (
    <div className="min-h-dvh bg-surface">
      <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col bg-surface sm:border-x sm:border-slate-200">
        <header className="pt-safe sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/75">
          <div className="flex h-14 items-center gap-3 px-4">
            <Link to="/app/profile" className="flex min-w-0 flex-1 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30">
              <Avatar name={name} src={user?.employee?.photoUrl} size="sm" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-ink">{name}</span>
                <span className="block truncate text-xs text-muted">{company?.name ?? user?.employee?.positionTitle ?? ''}</span>
              </span>
            </Link>
            {isAdmin && (
              <Link to="/admin" className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100" aria-label="Retour à l'administration">
                <LayoutDashboard className="h-5 w-5" />
              </Link>
            )}
            <NotificationBell allHref="/app/notifications" className="-mr-2" />
          </div>
        </header>

        <main key={location.pathname} className="flex-1 px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom,0px))] pt-4 animate-fade-in">
          <Outlet />
        </main>

        <nav
          aria-label="Navigation employé"
          className="pb-safe fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-lg border-t border-slate-200 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85 sm:border-x"
        >
          <ul className="grid grid-cols-5">
            {EMPLOYEE_NAV.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === '/app'}
                  className={({ isActive }) =>
                    cn(
                      'flex min-h-[60px] flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors focus-visible:bg-slate-50 focus-visible:outline-none',
                      isActive ? 'text-brand' : 'text-slate-500 hover:text-ink',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <span className={cn('flex h-7 w-12 items-center justify-center rounded-full transition-colors', isActive && 'bg-brand-50')}>
                        <item.icon className="h-5 w-5" strokeWidth={isActive ? 2.25 : 2} />
                      </span>
                      {item.label}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}
