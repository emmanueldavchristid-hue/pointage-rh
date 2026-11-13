import { Link } from 'react-router-dom';
import { AlarmClock, CalendarCheck, CalendarX2, ChevronRight, Clock3, Plane, TrendingUp } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Card, Skeleton } from '@/components/ui';
import { formatDuration, formatMonth } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useMySummary } from '../api';
import { QueryError } from './QueryError';

function Tile({ icon: Icon, label, value, sub, tone }: { icon: LucideIcon; label: string; value: React.ReactNode; sub?: React.ReactNode; tone: string }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-slate-100 bg-white p-3">
      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', tone)}>
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-xs leading-tight text-muted">{label}</p>
        <p className="tabular text-base font-semibold text-ink">{value}</p>
        {sub && <p className="tabular truncate text-[11px] text-muted">{sub}</p>}
      </div>
    </div>
  );
}

export function MonthSummary({ month }: { month: string }) {
  const q = useMySummary(month);
  const d = q.data;
  const ratio = d && d.expectedMinutes > 0 ? Math.min(1, d.workedMinutes / d.expectedMinutes) : 0;

  return (
    <Card>
      <div className="flex items-center justify-between px-4 pb-1 pt-3.5">
        <div>
          <h2 className="text-[15px] font-semibold text-ink">Mon mois</h2>
          <p className="text-xs text-muted">{formatMonth(month)}</p>
        </div>
        <Link to="/app/history" className="-mr-2 inline-flex min-h-[44px] items-center gap-1 rounded-lg px-2 text-sm font-medium text-brand hover:bg-brand-50">
          Historique <ChevronRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
      <div className="p-4 pt-2">
        {q.isPending ? (
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[66px] rounded-lg" />)}
          </div>
        ) : q.isError ? (
          <QueryError error={q.error} onRetry={q.refetch} />
        ) : d ? (
          <>
            <div className="mb-3">
              <div className="flex items-baseline justify-between text-sm">
                <span className="text-muted">Temps travaillé</span>
                <span className="tabular font-semibold text-ink">
                  {formatDuration(d.workedMinutes, { zero: '0 min' })}
                  <span className="font-normal text-muted"> / {formatDuration(d.expectedMinutes, { zero: '0 min' })}</span>
                </span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio * 100)} aria-label="Temps travaillé par rapport au temps prévu">
                <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${ratio * 100}%` }} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Tile icon={CalendarCheck} label="Jours présents" value={d.daysPresent} tone="bg-success-soft text-success" />
              <Tile icon={AlarmClock} label="Retards" value={d.lateCount} sub={d.lateMinutes > 0 ? `${formatDuration(d.lateMinutes)} au total` : undefined} tone="bg-warning-soft text-warning-strong" />
              <Tile icon={CalendarX2} label="Absences" value={d.absences} tone="bg-danger-soft text-danger" />
              <Tile icon={Plane} label="Congés pris" value={`${d.leaveDaysTaken} j`} tone="bg-brand-50 text-brand" />
              <Tile icon={TrendingUp} label="HS potentielles" value={formatDuration(d.overtimePotential, { zero: '0 min' })} tone="bg-sky-50 text-sky-700" />
              <Tile icon={Clock3} label="HS validées" value={formatDuration(d.overtimeValidated, { zero: '0 min' })} tone="bg-slate-100 text-slate-600" />
            </div>
          </>
        ) : null}
      </div>
    </Card>
  );
}
