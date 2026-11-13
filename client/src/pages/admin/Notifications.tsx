import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Bell, BellOff, Check, CheckCheck } from 'lucide-react';
import { Badge, Button, Card, EmptyState, PageHeader, Tabs, TabsList, TabsTrigger } from '@/components/ui';
import { ListSkeleton, LoadError } from '@/features/admin/shared';
import { isUnread, notificationKeys, useMarkAllNotificationsRead, useMarkNotificationRead } from '@/features/notifications/api';
import { api } from '@/lib/api';
import { formatDateLong, formatDateTime, formatRelative, getTimezone, todayISO, addDaysISO } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { AppNotification, NotificationsResponse } from '@/lib/types';

const dayOf = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: getTimezone(), year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));

function groupLabel(day: string) {
  const today = todayISO();
  if (day === today) return "Aujourd'hui";
  if (day === addDaysISO(today, -1)) return 'Hier';
  return formatDateLong(day);
}

export default function AdminNotificationsPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = React.useState<'all' | 'unread'>('all');
  const [limit, setLimit] = React.useState(50);
  const q = useQuery({
    queryKey: [...notificationKeys.all, 'page', { unread: filter === 'unread', limit }],
    queryFn: ({ signal }) => api.get<NotificationsResponse>('/notifications', { unread: filter === 'unread' ? 1 : undefined, limit }, signal),
    refetchInterval: 60_000,
  });
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const items = q.data?.items ?? [];
  const unread = q.data?.unreadCount ?? 0;

  const groups = React.useMemo(() => {
    const m = new Map<string, AppNotification[]>();
    items.forEach((n) => { const d = dayOf(n.createdAt); m.set(d, [...(m.get(d) ?? []), n]); });
    return [...m.entries()];
  }, [items]);

  function open(n: AppNotification) {
    if (isUnread(n)) markRead.mutate(n.id);
    const href = n.link ?? n.url;
    if (!href) return;
    if (/^https?:/.test(href)) window.open(href, '_blank', 'noopener');
    else navigate(href);
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Notifications"
        description={unread ? `${unread} notification${unread > 1 ? 's' : ''} non lue${unread > 1 ? 's' : ''}` : 'Vous êtes à jour.'}
        actions={<Button variant="outline" leftIcon={<CheckCheck />} disabled={!unread} loading={markAll.isPending} onClick={() => markAll.mutate()}>Tout marquer comme lu</Button>}
      />
      <Tabs value={filter} onValueChange={(v) => setFilter(v as 'all' | 'unread')} className="mb-4">
        <TabsList>
          <TabsTrigger value="all">Toutes</TabsTrigger>
          <TabsTrigger value="unread">Non lues{unread > 0 && <Badge variant="brand" className="px-1.5 py-0 tabular">{unread}</Badge>}</TabsTrigger>
        </TabsList>
      </Tabs>
      <Card className="overflow-hidden">
        {q.isPending ? (
          <div className="p-4"><ListSkeleton rows={5} /></div>
        ) : q.isError ? (
          <LoadError error={q.error} onRetry={q.refetch} />
        ) : items.length === 0 ? (
          <EmptyState icon={filter === 'unread' ? Check : BellOff} title={filter === 'unread' ? 'Aucune notification non lue' : 'Aucune notification'}
            description="Vous serez notifié des demandes de congés, anomalies et validations à effectuer." />
        ) : (
          <>
            {groups.map(([day, list]) => (
              <section key={day} aria-label={groupLabel(day)}>
                <h2 className="sticky top-0 z-10 border-b border-slate-100 bg-slate-50/95 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-muted backdrop-blur">{groupLabel(day)}</h2>
                <ul className="divide-y divide-slate-100">
                  {list.map((n) => {
                    const un = isUnread(n);
                    const href = n.link ?? n.url;
                    return (
                      <li key={n.id} className={cn('group flex gap-4 px-5 py-4 transition-colors', un ? 'bg-brand-50/40' : 'bg-white', href && 'hover:bg-slate-50')}>
                        <span className={cn('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full', un ? 'bg-brand text-white' : 'bg-slate-100 text-slate-400')}>
                          <Bell className="h-4 w-4" />
                        </span>
                        <button type="button" onClick={() => open(n)} disabled={!href && !un} className="min-w-0 flex-1 text-left focus-visible:outline-none disabled:cursor-default">
                          <p className={cn('text-sm', un ? 'font-semibold text-ink' : 'font-medium text-slate-700')}>{n.title ?? n.message ?? 'Notification'}</p>
                          {(n.body ?? (n.title ? n.message : null)) && <p className="mt-0.5 text-sm text-muted">{n.body ?? n.message}</p>}
                          <p className="mt-1 text-xs text-slate-400" title={formatDateTime(n.createdAt)}>{formatRelative(n.createdAt)}</p>
                        </button>
                        <div className="flex shrink-0 items-start gap-1">
                          {un && (
                            <Button variant="ghost" size="icon-sm" onClick={() => markRead.mutate(n.id)} aria-label="Marquer comme lue"><Check /></Button>
                          )}
                          {href && (
                            <Button variant="ghost" size="sm" rightIcon={<ArrowUpRight />} onClick={() => open(n)}>Ouvrir</Button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
            {items.length >= limit && (
              <div className="border-t border-slate-100 p-3 text-center">
                <Button variant="ghost" size="sm" onClick={() => setLimit((l) => l + 50)} loading={q.isFetching}>Afficher plus</Button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
