import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { NotificationsResponse } from '@/lib/types';

export const notificationKeys = {
  all: ['notifications'] as const,
  list: (unread?: boolean) => ['notifications', 'list', { unread: !!unread }] as const,
};

export function useNotifications(opts: { unread?: boolean; enabled?: boolean } = {}) {
  return useQuery({
    queryKey: notificationKeys.list(opts.unread),
    queryFn: ({ signal }) => api.get<NotificationsResponse>('/notifications', opts.unread ? { unread: 1 } : undefined, signal),
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    enabled: opts.enabled ?? true,
    meta: { silent: true },
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post(`/notifications/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: notificationKeys.all }),
  });
}

export const isUnread = (n: { read?: boolean; readAt?: string | null }) =>
  n.read === undefined ? !n.readAt : !n.read;
