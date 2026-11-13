import { Link } from 'react-router-dom';
import { Bell, ChevronRight } from 'lucide-react';
import { Card, EmptyState, Skeleton } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { useClockStatus } from '@/features/clock/api';
import { ClockActions } from '@/features/clock/components/ClockActions';
import { ClockStatusCard } from '@/features/clock/components/ClockStatusCard';
import { MonthSummary } from '@/features/employee/components/MonthSummary';
import { NotificationList } from '@/features/employee/components/NotificationList';
import { QueryError } from '@/features/employee/components/QueryError';
import { useNotifications } from '@/features/notifications/api';
import { currentMonthISO, getTimezone } from '@/lib/format';

function greeting() {
  const h = Number(new Intl.DateTimeFormat('fr-FR', { hour: 'numeric', hourCycle: 'h23', timeZone: getTimezone() }).format(new Date()));
  return h >= 18 || h < 4 ? 'Bonsoir' : 'Bonjour';
}

export default function AppHomePage() {
  const { user } = useAuth();
  const status = useClockStatus();
  const notifs = useNotifications();
  const latest = (notifs.data?.items ?? []).slice(0, 3);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">
          {greeting()}{user?.employee ? `, ${user.employee.firstNames.split(' ')[0]}` : ''}
        </h1>
        <p className="text-sm text-muted">Votre journée de travail en un coup d'œil.</p>
      </div>

      {status.isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-[260px] rounded-xl" />
          <Skeleton className="h-[84px] rounded-2xl" />
          <Skeleton className="h-[84px] rounded-2xl" />
        </div>
      ) : status.isError ? (
        <Card><QueryError error={status.error} onRetry={status.refetch} /></Card>
      ) : (
        <>
          <ClockStatusCard status={status.data} receivedAt={status.dataUpdatedAt} />
          <ClockActions status={status.data} />
        </>
      )}

      <MonthSummary month={currentMonthISO()} />

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between px-4 pb-1 pt-3.5">
          <h2 className="text-[15px] font-semibold text-ink">Dernières notifications</h2>
          <Link to="/app/notifications" className="-mr-2 inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-sm font-medium text-brand hover:bg-brand-50">
            Tout voir <ChevronRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
        {notifs.isPending ? (
          <div className="space-y-2 p-4"><Skeleton className="h-12" /><Skeleton className="h-12" /></div>
        ) : notifs.isError ? (
          <QueryError error={notifs.error} onRetry={notifs.refetch} />
        ) : latest.length === 0 ? (
          <EmptyState compact icon={Bell} title="Aucune notification" description="Vous serez prévenu ici des décisions sur vos demandes et des anomalies de pointage." />
        ) : (
          <div className="pb-1"><NotificationList items={latest} /></div>
        )}
      </Card>
    </div>
  );
}
