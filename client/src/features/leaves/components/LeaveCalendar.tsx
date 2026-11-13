import * as React from 'react';
import { CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button, Card, EmptyState, Skeleton, Tooltip } from '@/components/ui';
import { DepartmentSelect, LoadError } from '@/features/admin/shared';
import { useHolidays } from '@/features/schedules/api';
import { LEAVE_STATUS, labelOf } from '@/lib/labels';
import { addMonthsISO, currentMonthISO, formatDateShort, formatMonth, monthRange, todayISO } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useLeaveCalendar, type LeaveCalendarItem } from '../api';

function daysOf(month: string): string[] {
  const { from, to } = monthRange(month);
  const n = Number(to.slice(8, 10));
  return Array.from({ length: n }, (_, i) => `${from.slice(0, 8)}${String(i + 1).padStart(2, '0')}`);
}
const isoWeekday = (iso: string) => ((new Date(`${iso}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;

/** Calendrier mensuel des absences : employés en lignes, jours en colonnes, couleur par type. */
export function LeaveCalendar() {
  const [month, setMonth] = React.useState(currentMonthISO());
  const [departmentId, setDepartmentId] = React.useState('');
  const range = monthRange(month);
  const q = useLeaveCalendar({ ...range, departmentId: departmentId || undefined });
  const holidaysQ = useHolidays();
  const days = daysOf(month);
  const today = todayISO();
  const year = month.slice(0, 4);

  const holidays = React.useMemo(() => {
    const map = new Map<string, string>();
    if (q.data?.holidays) q.data.holidays.forEach((h) => map.set(h.date, h.label));
    else (holidaysQ.data ?? []).forEach((h) => {
      const d = h.recurring ? `${year}-${h.date.slice(5)}` : h.date;
      if (d.startsWith(month)) map.set(d, h.label);
    });
    return map;
  }, [q.data, holidaysQ.data, month, year]);

  const rows = React.useMemo(() => {
    const by = new Map<number, { name: string; dept: string | null; items: LeaveCalendarItem[] }>();
    (q.data?.items ?? []).filter((i) => i.status !== 'ANNULE' && i.status !== 'REFUSE' && i.status !== 'BROUILLON').forEach((i) => {
      const r = by.get(i.employeeId) ?? { name: i.fullName, dept: i.departmentName, items: [] };
      r.items.push(i);
      by.set(i.employeeId, r);
    });
    return [...by.entries()].sort((a, b) => a[1].name.localeCompare(b[1].name, 'fr'));
  }, [q.data]);

  const legend = React.useMemo(() => {
    const m = new Map<string, string | null>();
    (q.data?.items ?? []).forEach((i) => m.set(i.type, i.color));
    return [...m.entries()];
  }, [q.data]);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" onClick={() => setMonth((m) => addMonthsISO(m, -1))} aria-label="Mois précédent"><ChevronLeft /></Button>
          <span className="min-w-[150px] text-center text-sm font-semibold text-ink">{formatMonth(month)}</span>
          <Button variant="outline" size="icon-sm" onClick={() => setMonth((m) => addMonthsISO(m, 1))} aria-label="Mois suivant"><ChevronRight /></Button>
          {month !== currentMonthISO() && <Button variant="ghost" size="sm" onClick={() => setMonth(currentMonthISO())}>Aujourd'hui</Button>}
        </div>
        <div className="sm:ml-auto sm:w-60"><DepartmentSelect value={departmentId} onChange={setDepartmentId} /></div>
      </div>

      {q.isPending ? (
        <div className="space-y-2 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
      ) : q.isError ? (
        <LoadError error={q.error} onRetry={q.refetch} />
      ) : (
        <>
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full border-collapse text-xs" aria-label={`Calendrier des congés — ${formatMonth(month)}`}>
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80">
                  <th className="sticky left-0 z-10 min-w-[180px] bg-slate-50 px-3 py-2 text-left font-medium text-muted">Employé</th>
                  {days.map((d) => {
                    const wd = isoWeekday(d);
                    const hol = holidays.get(d);
                    return (
                      <th key={d} scope="col" title={hol ?? undefined}
                        className={cn('w-8 min-w-[30px] px-0 py-1.5 text-center font-medium', wd >= 6 || hol ? 'text-slate-400' : 'text-slate-600', hol && 'bg-slate-200/70', d === today && 'text-brand')}>
                        <div className="text-[10px] uppercase">{['L', 'M', 'M', 'J', 'V', 'S', 'D'][wd - 1]}</div>
                        <div className={cn('mx-auto mt-0.5 flex h-5 w-5 items-center justify-center rounded-full tabular', d === today && 'bg-brand text-white')}>{Number(d.slice(8))}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td colSpan={days.length + 1}>
                    <EmptyState compact icon={CalendarRange} title="Aucune absence planifiée" description={`Aucun congé approuvé ou en attente en ${formatMonth(month).toLowerCase()}.`} />
                  </td></tr>
                ) : rows.map(([id, r]) => (
                  <tr key={id} className="border-b border-slate-100">
                    <th scope="row" className="sticky left-0 z-10 bg-white px-3 py-1.5 text-left font-normal">
                      <p className="truncate text-[13px] font-medium text-ink">{r.name}</p>
                      {r.dept && <p className="truncate text-[11px] text-muted">{r.dept}</p>}
                    </th>
                    {days.map((d) => {
                      const item = r.items.find((i) => i.startDate <= d && i.endDate >= d);
                      const wd = isoWeekday(d);
                      const hol = holidays.get(d);
                      const bg = hol ? 'bg-slate-200/70' : wd >= 6 ? 'bg-slate-50' : '';
                      if (!item) return <td key={d} className={cn('h-10 border-l border-slate-100', bg)} />;
                      const pending = item.status === 'EN_ATTENTE';
                      const startCap = item.startDate === d;
                      const endCap = item.endDate === d;
                      return (
                        <td key={d} className={cn('h-10 border-l border-slate-100 px-0', bg)}>
                          <Tooltip content={`${item.type} · ${formatDateShort(item.startDate)} → ${formatDateShort(item.endDate)} · ${labelOf(LEAVE_STATUS, item.status)}${hol ? ` · férié : ${hol}` : ''}`}>
                            <div
                              className={cn('mx-0 h-6', startCap && 'ml-0.5 rounded-l-md', endCap && 'mr-0.5 rounded-r-md', pending && 'opacity-60')}
                              style={{
                                backgroundColor: item.color || '#64748B',
                                backgroundImage: pending ? 'repeating-linear-gradient(45deg, rgba(255,255,255,.45) 0 4px, transparent 4px 8px)' : undefined,
                              }}
                              aria-label={`${r.name} : ${item.type} le ${formatDateShort(d)}`}
                            />
                          </Tooltip>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-slate-100 px-4 py-3 text-xs text-muted">
            {legend.map(([label, color]) => (
              <span key={label} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm" style={{ backgroundColor: color || '#64748B' }} />{label}</span>
            ))}
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-slate-400 opacity-60" style={{ backgroundImage: 'repeating-linear-gradient(45deg, rgba(255,255,255,.5) 0 3px, transparent 3px 6px)' }} />En attente</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm bg-slate-200" />Jour férié</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-4 rounded-sm border border-slate-200 bg-slate-50" />Week-end</span>
          </div>
        </>
      )}
    </Card>
  );
}
