import * as React from 'react';
import { Card, PageHeader, Skeleton, StatusBadge } from '@/components/ui';
import { useMyCalendar } from '@/features/employee/api';
import { MonthNav } from '@/features/employee/components/MonthNav';
import { QueryError } from '@/features/employee/components/QueryError';
import type { CalendarDay } from '@/features/employee/types';
import { currentMonthISO, formatDateLong, todayISO, WEEKDAYS_SHORT } from '@/lib/format';
import { CLOCK_STATE, DAY_STATUS, labelOf } from '@/lib/labels';
import type { DayStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

const DAY_COLORS: Record<DayStatus, string> = {
  PRESENT: 'bg-green-100 text-green-900',
  RETARD: 'bg-amber-100 text-amber-900',
  ABSENCE_NON_JUSTIFIEE: 'bg-red-100 text-red-900',
  ABSENCE_JUSTIFIEE: 'bg-slate-200 text-slate-800',
  CONGE: 'bg-brand-100 text-brand-800',
  PERMISSION: 'bg-indigo-100 text-indigo-900',
  MISSION: 'bg-sky-100 text-sky-900',
  FERIE: 'bg-violet-100 text-violet-900',
  NON_TRAVAILLE: 'bg-slate-50 text-slate-400',
  INCOMPLET: 'bg-orange-100 text-orange-900',
  EN_COURS: 'bg-sky-50 text-sky-900',
};

const LEGEND: DayStatus[] = ['PRESENT', 'RETARD', 'INCOMPLET', 'ABSENCE_NON_JUSTIFIEE', 'ABSENCE_JUSTIFIEE', 'CONGE', 'PERMISSION', 'MISSION', 'FERIE', 'NON_TRAVAILLE'];

const leaveLabel = (l: CalendarDay['leave']) => (!l ? null : typeof l === 'string' ? l : l.label ?? l.type ?? 'Congé');

function buildGrid(month: string): (string | null)[] {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const offset = (first.getUTCDay() + 6) % 7; // lundi = 0
  const cells: (string | null)[] = Array.from({ length: offset }, () => null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${month}-${String(d).padStart(2, '0')}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}

export default function AppCalendarPage() {
  const [month, setMonth] = React.useState(currentMonthISO());
  const [selected, setSelected] = React.useState<string | null>(null);
  const q = useMyCalendar(month);
  const today = todayISO();
  const byDate = React.useMemo(() => new Map((q.data ?? []).map((d) => [d.date.slice(0, 10), d])), [q.data]);
  const cells = React.useMemo(() => buildGrid(month), [month]);
  const sel = selected ? byDate.get(selected) : undefined;

  React.useEffect(() => setSelected(null), [month]);

  return (
    <div className="space-y-4">
      <PageHeader title="Calendrier" description="Vos présences, congés et jours fériés." />
      <MonthNav month={month} onChange={setMonth} allowFuture />

      <Card className="p-3">
        <div className="mb-1 grid grid-cols-7 text-center text-[11px] font-medium uppercase tracking-wide text-muted">
          {WEEKDAYS_SHORT.map((d) => <div key={d} className="py-1.5">{d}</div>)}
        </div>
        {q.isPending ? (
          <div className="grid grid-cols-7 gap-1">{Array.from({ length: 35 }).map((_, i) => <Skeleton key={i} className="aspect-square rounded-lg" />)}</div>
        ) : q.isError ? (
          <QueryError error={q.error} onRetry={q.refetch} />
        ) : (
          <div className="grid grid-cols-7 gap-1" role="grid" aria-label="Calendrier du mois">
            {cells.map((date, i) => {
              if (!date) return <div key={`e${i}`} />;
              const info = byDate.get(date);
              const status = info?.holiday ? 'FERIE' : info?.dayStatus ?? null;
              const isToday = date === today;
              const isSel = date === selected;
              const label = [
                formatDateLong(date),
                status ? labelOf(DAY_STATUS, status) : null,
                info?.holiday ? `férié : ${info.holiday}` : null,
                leaveLabel(info?.leave),
              ].filter(Boolean).join(', ');
              return (
                <button
                  key={date}
                  type="button"
                  onClick={() => setSelected(isSel ? null : date)}
                  aria-label={label}
                  aria-pressed={isSel}
                  className={cn(
                    'relative flex aspect-square min-h-[44px] flex-col items-center justify-center rounded-lg text-sm font-medium transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40',
                    status ? DAY_COLORS[status] : 'bg-white text-ink hover:bg-slate-50',
                    isToday && 'ring-2 ring-brand ring-offset-1',
                    isSel && 'shadow-pop ring-2 ring-ink ring-offset-1',
                  )}
                >
                  <span className="tabular">{Number(date.slice(8))}</span>
                  {(info?.holiday || info?.leave) && <span className="absolute bottom-1 h-1 w-1 rounded-full bg-current opacity-70" aria-hidden />}
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {selected && (
        <Card className="p-4 animate-fade-in" aria-live="polite">
          <p className="text-sm font-semibold text-ink">{formatDateLong(selected)}</p>
          {sel ? (
            <div className="mt-2 space-y-1.5 text-sm">
              <div className="flex flex-wrap gap-1.5">
                {sel.dayStatus && <StatusBadge kind="day" value={sel.dayStatus} />}
                {sel.state && sel.state !== 'NON_POINTE' && <StatusBadge kind="state" value={sel.state} dot={false} />}
              </div>
              {sel.holiday && <p className="text-muted">Jour férié : <span className="font-medium text-ink">{sel.holiday}</span></p>}
              {sel.leave && <p className="text-muted">Absence prévue : <span className="font-medium text-ink">{leaveLabel(sel.leave)}</span></p>}
              {sel.state && <p className="text-xs text-muted">État du pointage : {labelOf(CLOCK_STATE, sel.state)}</p>}
            </div>
          ) : (
            <p className="mt-1 text-sm text-muted">Aucune information pour cette journée.</p>
          )}
        </Card>
      )}

      <Card className="p-4">
        <h2 className="mb-2.5 text-sm font-semibold text-ink">Légende</h2>
        <ul className="grid grid-cols-2 gap-x-3 gap-y-2 text-[13px] text-slate-700">
          {LEGEND.map((s) => (
            <li key={s} className="flex items-center gap-2">
              <span className={cn('h-4 w-4 shrink-0 rounded', DAY_COLORS[s], s === 'NON_TRAVAILLE' && 'border border-slate-200')} aria-hidden />
              {labelOf(DAY_STATUS, s)}
            </li>
          ))}
          <li className="flex items-center gap-2">
            <span className="h-4 w-4 shrink-0 rounded ring-2 ring-brand ring-offset-1" aria-hidden />Aujourd'hui
          </li>
        </ul>
      </Card>
    </div>
  );
}
