import { Bell, CheckCheck } from 'lucide-react';
import { Button, Card, EmptyState, PageHeader, Skeleton } from '@/components/ui';
import { NotificationList } from '@/features/employee/components/NotificationList';
import { QueryError } from '@/features/employee/components/QueryError';
import { useMarkAllNotificationsRead, useNotifications } from '@/features/notifications/api';

export default function AppNotificationsPage() {
  const q = useNotifications();
  const markAll = useMarkAllNotificationsRead();
  const items = q.data?.items ?? [];
  const unread = q.data?.unreadCount ?? 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Notifications"
        description={unread > 0 ? `${unread} non lue${unread > 1 ? 's' : ''}` : 'Tout est à jour.'}
        actions={
          <Button variant="outline" size="lg" leftIcon={<CheckCheck />} disabled={unread === 0} loading={markAll.isPending} onClick={() => markAll.mutate()}>
            Tout marquer lu
          </Button>
        }
      />
      <Card className="overflow-hidden">
        {q.isPending ? (
          <div className="space-y-3 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : q.isError ? (
          <QueryError error={q.error} onRetry={q.refetch} />
        ) : items.length === 0 ? (
          <EmptyState icon={Bell} title="Aucune notification" description="Les décisions sur vos demandes et les alertes de pointage s'afficheront ici." />
        ) : (
          <NotificationList items={items} />
        )}
      </Card>
    </div>
  );
}
