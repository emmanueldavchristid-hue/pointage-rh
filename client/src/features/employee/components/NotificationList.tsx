import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { formatRelative } from '@/lib/format';
import type { AppNotification } from '@/lib/types';
import { cn } from '@/lib/utils';
import { isUnread, useMarkNotificationRead } from '@/features/notifications/api';

export function NotificationList({ items }: { items: AppNotification[] }) {
  const navigate = useNavigate();
  const markRead = useMarkNotificationRead();

  return (
    <ul className="divide-y divide-slate-100">
      {items.map((n) => {
        const unread = isUnread(n);
        const link = n.link ?? n.url ?? null;
        const text = n.body ?? n.message ?? null;
        const open = () => {
          if (unread) markRead.mutate(n.id);
          if (link && link.startsWith('/')) navigate(link);
        };
        return (
          <li key={n.id}>
            <button
              type="button"
              onClick={open}
              className={cn('flex min-h-[56px] w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none', unread && 'bg-brand-50/40')}
            >
              <span className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full', unread ? 'bg-brand-50 text-brand' : 'bg-slate-100 text-slate-500')}>
                <Bell className="h-4 w-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-start justify-between gap-2">
                  <span className={cn('text-sm', unread ? 'font-semibold text-ink' : 'font-medium text-slate-700')}>{n.title ?? 'Notification'}</span>
                  {unread && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" aria-label="Non lue" />}
                </span>
                {text && <span className="mt-0.5 line-clamp-2 block text-[13px] leading-snug text-muted">{text}</span>}
                <span className="mt-1 block text-xs text-slate-400">{formatRelative(n.createdAt)}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
