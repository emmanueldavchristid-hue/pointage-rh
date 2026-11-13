import * as React from 'react';
import { CalendarSearch } from 'lucide-react';
import { EmptyState, PageHeader, Skeleton } from '@/components/ui';
import { useMyAttendance } from '@/features/employee/api';
import { AttendanceDayItem } from '@/features/employee/components/AttendanceDayItem';
import { MonthNav } from '@/features/employee/components/MonthNav';
import { QueryError } from '@/features/employee/components/QueryError';
import { currentMonthISO, formatDuration, monthRange, todayISO } from '@/lib/format';

export default function AppHistoryPage() {
  const [month, setMonth] = React.useState(currentMonthISO());
  const range = monthRange(month);
  const today = todayISO();
  const to = range.to > today ? today : range.to;
  const q = useMyAttendance(range.from, to);

  const days = React.useMemo(() => [...(q.data ?? [])].sort((a, b) => b.workDate.localeCompare(a.workDate)), [q.data]);
  const totals = React.useMemo(
    () => days.reduce((acc, d) => ({
      worked: acc.worked + (d.workedMinutes || 0),
      late: acc.late + (d.lateMinutes > 0 ? 1 : 0),
      ot: acc.ot + (d.overtimePotentialMinutes || 0),
    }), { worked: 0, late: 0, ot: 0 }),
    [days],
  );

  return (
    <div className="space-y-4">
      <PageHeader title="Historique" description="Vos journées de travail, jour par jour." />
      <MonthNav month={month} onChange={setMonth} />

      {q.isPending ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
      ) : q.isError ? (
        <QueryError error={q.error} onRetry={q.refetch} />
      ) : days.length === 0 ? (
        <EmptyState icon={CalendarSearch} title="Aucune journée sur cette période" description="Les journées apparaissent ici dès votre premier pointage du mois." />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl border border-slate-200 bg-white px-2 py-2.5"><p className="text-[11px] text-muted">Travail effectif</p><p className="tabular text-sm font-semibold text-ink">{formatDuration(totals.worked, { zero: '0 min' })}</p></div>
            <div className="rounded-xl border border-slate-200 bg-white px-2 py-2.5"><p className="text-[11px] text-muted">Jours en retard</p><p className="tabular text-sm font-semibold text-ink">{totals.late}</p></div>
            <div className="rounded-xl border border-slate-200 bg-white px-2 py-2.5"><p className="text-[11px] text-muted">HS potentielles</p><p className="tabular text-sm font-semibold text-ink">{formatDuration(totals.ot, { zero: '0 min' })}</p></div>
          </div>
          <ul className="space-y-2">{days.map((d) => <AttendanceDayItem key={d.id ?? d.workDate} day={d} />)}</ul>
        </>
      )}
    </div>
  );
}
