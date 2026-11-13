import * as React from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { AlertCircle, ChevronRight, ChevronsLeft, ChevronsRight, KeyRound, LogOut, Menu, Smartphone, X } from 'lucide-react';
import {
  Avatar, Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
  DropdownMenuTrigger, Tooltip,
} from '@/components/ui';
import { displayName, useAuth } from '@/features/auth/AuthProvider';
import { ChangePasswordDialog } from '@/features/auth/ChangePasswordDialog';
import { ROLE_LABELS } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { BrandMark } from './BrandMark';
import { NotificationBell } from './NotificationBell';
import { breadcrumbFor, navForRole } from './nav';

const COLLAPSE_KEY = 'pointage-rh.sidebar-collapsed';

function SidebarContent({ collapsed, onNavigate, footer }: { collapsed: boolean; onNavigate?: () => void; footer?: React.ReactNode }) {
  const { role, company } = useAuth();
  const sections = navForRole(role);
  const name = company?.name ?? 'Pointage RH';

  return (
    <div className="flex h-full flex-col">
      <div className={cn('flex h-16 shrink-0 items-center gap-3 border-b border-white/10', collapsed ? 'justify-center px-2' : 'px-5')}>
        <BrandMark logoUrl={company?.logoUrl} name={name} inverted />
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{name}</p>
            <p className="text-xs text-slate-400">Gestion du personnel</p>
          </div>
        )}
      </div>
      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5 scrollbar-thin" aria-label="Navigation principale">
        {sections.map((section) => (
          <div key={section.title}>
            {collapsed ? (
              <div className="mx-auto mb-2 h-px w-6 bg-white/10" />
            ) : (
              <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{section.title}</p>
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <li key={item.to}>
                  <Tooltip content={collapsed ? item.label : null} side="right">
                    <NavLink
                      to={item.to}
                      end={item.to === '/admin'}
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        cn(
                          'group flex h-9 items-center gap-3 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60',
                          collapsed ? 'justify-center px-0' : 'px-3',
                          isActive ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-100',
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <item.icon className={cn('h-[18px] w-[18px] shrink-0', isActive ? 'text-brand-500' : 'text-slate-500 group-hover:text-slate-300')} />
                          {!collapsed && <span className="truncate">{item.label}</span>}
                          {collapsed && <span className="sr-only">{item.label}</span>}
                        </>
                      )}
                    </NavLink>
                  </Tooltip>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      {footer && <div className="shrink-0 border-t border-white/10 p-3">{footer}</div>}
    </div>
  );
}

function ProfileMenu() {
  const { user, logout, hasEmployee } = useAuth();
  const [pwdOpen, setPwdOpen] = React.useState(false);
  const name = displayName(user);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex items-center gap-2.5 rounded-lg p-1 pr-2 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
            aria-label="Menu du profil"
          >
            <Avatar name={name} src={user?.employee?.photoUrl} size="sm" />
            <span className="hidden text-left md:block">
              <span className="block max-w-[160px] truncate text-sm font-medium text-ink">{name}</span>
              <span className="block text-xs text-muted">{user ? ROLE_LABELS[user.role] : ''}</span>
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-60">
          <DropdownMenuLabel className="py-2">
            <span className="block truncate text-sm font-semibold text-ink">{name}</span>
            <span className="block truncate text-xs font-normal text-muted">{user?.login}</span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {hasEmployee && (
            <DropdownMenuItem asChild icon={<Smartphone />}>
              <Link to="/app">Mon espace employé</Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem icon={<KeyRound />} onSelect={() => setPwdOpen(true)}>Changer le mot de passe</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem destructive icon={<LogOut />} onSelect={() => void logout()}>Se déconnecter</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ChangePasswordDialog open={pwdOpen} onOpenChange={setPwdOpen} />
    </>
  );
}

export function AdminLayout() {
  const location = useLocation();
  const { company, hasRole } = useAuth();
  const [collapsed, setCollapsed] = React.useState(() => localStorage.getItem(COLLAPSE_KEY) === '1');
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const crumb = breadcrumbFor(location.pathname);

  React.useEffect(() => { localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0'); }, [collapsed]);
  React.useEffect(() => { setMobileOpen(false); }, [location.pathname]);
  React.useEffect(() => {
    document.title = crumb ? `${crumb.label} · ${company?.name ?? 'Pointage RH'}` : company?.name ?? 'Pointage RH';
  }, [crumb?.label, company?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  const showSetupBanner = company && !company.setupCompleted && hasRole('SUPER_ADMIN') && location.pathname !== '/admin/setup';

  return (
    <div className="min-h-dvh bg-surface">
      {/* Sidebar desktop */}
      <aside
        className={cn('fixed inset-y-0 left-0 z-30 hidden bg-ink transition-[width] duration-200 lg:block', collapsed ? 'w-[72px]' : 'w-64')}
      >
        <SidebarContent
          collapsed={collapsed}
          footer={
            <button
              type="button"
              onClick={() => setCollapsed((c) => !c)}
              className={cn(
                'flex h-9 w-full items-center gap-3 rounded-lg text-sm font-medium text-slate-500 transition-colors hover:bg-white/5 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60',
                collapsed ? 'justify-center' : 'px-3',
              )}
              aria-label={collapsed ? 'Déplier le menu' : 'Replier le menu'}
            >
              {collapsed ? <ChevronsRight className="h-[18px] w-[18px]" /> : <ChevronsLeft className="h-[18px] w-[18px]" />}
              {!collapsed && <span>Replier le menu</span>}
            </button>
          }
        />
      </aside>

      {/* Drawer mobile */}
      <DialogPrimitive.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-slate-900/50 data-[state=open]:animate-fade-in lg:hidden" />
          <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-ink shadow-pop data-[state=open]:animate-slide-in-left focus:outline-none lg:hidden">
            <DialogPrimitive.Title className="sr-only">Menu</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">Navigation principale</DialogPrimitive.Description>
            <SidebarContent collapsed={false} onNavigate={() => setMobileOpen(false)} />
            <DialogPrimitive.Close className="absolute right-3 top-4 flex h-9 w-9 items-center justify-center rounded-md text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Fermer le menu">
              <X className="h-5 w-5" />
            </DialogPrimitive.Close>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <div className={cn('flex min-h-dvh flex-col transition-[padding] duration-200', collapsed ? 'lg:pl-[72px]' : 'lg:pl-64')}>
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur supports-[backdrop-filter]:bg-white/75 sm:px-6">
          <Button variant="ghost" size="icon" className="-ml-2 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Ouvrir le menu">
            <Menu className="!size-5" />
          </Button>
          <nav aria-label="Fil d'Ariane" className="min-w-0 flex-1">
            <ol className="flex items-center gap-1.5 text-sm">
              {crumb?.section && (
                <li className="hidden items-center gap-1.5 text-muted sm:flex">
                  {crumb.section}
                  <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
                </li>
              )}
              <li className="truncate">
                {crumb?.sub ? (
                  <Link to={crumb.to} className="text-muted hover:text-ink">{crumb.label}</Link>
                ) : (
                  <span className="font-medium text-ink">{crumb?.label ?? ''}</span>
                )}
              </li>
              {crumb?.sub && (
                <li className="flex items-center gap-1.5 font-medium text-ink">
                  <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
                  {crumb.sub}
                </li>
              )}
            </ol>
          </nav>
          <div className="flex items-center gap-1 sm:gap-2">
            <NotificationBell allHref="/admin/notifications" />
            <div className="mx-1 hidden h-6 w-px bg-slate-200 sm:block" />
            <ProfileMenu />
          </div>
        </header>

        {showSetupBanner && (
          <div className="border-b border-warning-border bg-warning-soft px-4 py-2.5 sm:px-6">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-warning-strong">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span className="font-medium">La configuration initiale n'est pas terminée : le pointage est inactif.</span>
              <Link to="/admin/setup" className="font-semibold underline underline-offset-4 hover:no-underline">Terminer la configuration</Link>
            </div>
          </div>
        )}

        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
