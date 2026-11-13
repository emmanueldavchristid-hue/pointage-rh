import * as React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { Button, Popover, PopoverContent, PopoverTrigger, Skeleton } from '@/components/ui';
import { isUnread, useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications } from '@/features/notifications/api';
import { formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { AppNotification } from '@/lib/types';

export function NotificationBell({ allHref, className }: { allHref: string; className?: string }) {
  const [open, setOpen] = React.useState(false);
  const navigate = useNavigate();
  const { data, isPending, isError } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const count = data?.unreadCount ?? 0;
  const items = (data?.items ?? []).slice(0, 8);

  function openItem(n: AppNotification) {
    if (isUnread(n)) markRead.mutate(n.id);
    const href = n.link ?? n.url;
    if (href) {
      setOpen(false);
      if (/^https?:/.test(href)) window.open(href, '_blank', 'noopener');
      else navigate(href);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('relative h-11 w-11 sm:h-10 sm:w-10', className)}
          aria-label={count ? `Notifications (${count} non lues)` : 'Notifications'}
        >
          <Bell className="!size-5" />
          {count > 0 && (
            <span className="absolute right-1.5 top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-white tabular">
              {count > 99 ? '99+' : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(380px,calc(100vw-1.5rem))] p-0">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-ink">Notifications</p>
            <p className="text-xs text-muted">{count ? `${count} non lue${count > 1 ? 's' : ''}` : 'Tout est à jour'}</p>
          </div>
          <Button variant="ghost" size="sm" disabled={!count} loading={markAll.isPending} onClick={() => markAll.mutate()} leftIcon={<CheckCheck />}>
            Tout marquer lu
          </Button>
        </div>
        <div className="max-h-[min(420px,60vh)] overflow-y-auto scrollbar-thin">
          {isPending ? (
            <div className="space-y-3 p-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="space-y-1.5"><Skeleton className="h-3.5 w-3/4" /><Skeleton className="h-3 w-1/2" /></div>
              ))}
            </div>
          ) : isError ? (
            <p className="px-4 py-8 text-center text-sm text-muted">Notifications indisponibles pour le moment.</p>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center px-4 py-10 text-center">
              <Bell className="mb-2 h-5 w-5 text-slate-300" />
              <p className="text-sm text-muted">Aucune notification</p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {items.map((n) => {
                const unread = isUnread(n);
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => openItem(n)}
                      className={cn('flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none', unread && 'bg-brand-50/40')}
                    >
                      <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', unread ? 'bg-brand' : 'bg-transparent')} />
                      <span className="min-w-0 flex-1">
                        {n.title && <span className={cn('block text-sm', unread ? 'font-semibold text-ink' : 'font-medium text-slate-700')}>{n.title}</span>}
                        {(n.message ?? n.body) && <span className="mt-0.5 block text-[13px] leading-snug text-muted line-clamp-2">{n.message ?? n.body}</span>}
                        <span className="mt-1 block text-xs text-slate-400">{formatRelative(n.createdAt)}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="border-t border-slate-100 p-2">
          <Link to={allHref} onClick={() => setOpen(false)} className="flex h-9 items-center justify-center rounded-md text-sm font-medium text-brand hover:bg-brand-50">
            Voir toutes les notifications
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
