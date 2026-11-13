import * as React from 'react';
import { ChevronDown, ShieldCheck } from 'lucide-react';
import { Badge, StatusBadge } from '@/components/ui';
import { formatDayShort, formatDuration, formatTime } from '@/lib/format';
import { labelOf, CLOCK_STATE } from '@/lib/labels';
import type { Attendance } from '@/lib/types';
import { cn } from '@/lib/utils';

function Row({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'warning' | 'success' }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className={cn('tabular font-medium', tone === 'warning' ? 'text-warning-strong' : tone === 'success' ? 'text-success' : 'text-ink')}>{value}</dd>
    </div>
  );
}

export function AttendanceDayItem({ day }: { day: Attendance }) {
  const [open, setOpen] = React.useState(false);
  const id = `day-${day.id ?? day.workDate}`;
  const hasClock = !!(day.arrivalAt || day.departureAt);

  return (
    <li className="rounded-xl border border-slate-200 bg-white shadow-xs">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={id}
        className="flex min-h-[64px] w-full items-center gap-3 rounded-xl px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-semibold text-ink">{formatDayShort(day.workDate)}</span>
            <StatusBadge kind="day" value={day.dayStatus} />
            {day.corrected && (
              <Badge variant="info" className="gap-1"><ShieldCheck className="h-3 w-3" aria-hidden />Corrigé par les RH</Badge>
            )}
          </div>
          <p className="tabular mt-1 text-[13px] text-muted">
            {hasClock ? (
              <>
                {formatTime(day.arrivalAt)} → {formatTime(day.departureAt)}
                {day.lateMinutes > 0 && <span className="text-warning-strong"> · retard {formatDuration(day.lateMinutes)}</span>}
              </>
            ) : (
              'Aucun pointage'
            )}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="tabular text-sm font-semibold text-ink">{hasClock ? formatDuration(day.workedMinutes, { zero: '0 min' }) : '—'}</p>
          {day.overtimePotentialMinutes > 0 && <p className="tabular text-[11px] font-medium text-sky-700">+{formatDuration(day.overtimePotentialMinutes)} sup.</p>}
        </div>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-slate-400 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <dl id={id} className="divide-y divide-slate-100 border-t border-slate-100 px-4 py-2 animate-fade-in">
          <Row label="Arrivée" value={formatTime(day.arrivalAt)} />
          <Row label="Départ" value={formatTime(day.departureAt)} />
          <Row label="Retard retenu" value={day.lateMinutes > 0 ? formatDuration(day.lateMinutes) : 'Aucun'} tone={day.lateMinutes > 0 ? 'warning' : undefined} />
          {day.lateRawMinutes > day.lateMinutes && <Row label="Retard brut (avant tolérance)" value={formatDuration(day.lateRawMinutes)} />}
          {day.earlyLeaveMinutes > 0 && <Row label="Départ anticipé" value={formatDuration(day.earlyLeaveMinutes)} tone="warning" />}
          <Row label="Temps de présence" value={formatDuration(day.presenceMinutes, { zero: '0 min' })} />
          <Row label="Pauses" value={formatDuration(day.breakMinutes, { zero: '0 min' })} />
          <Row label="Travail effectif" value={formatDuration(day.workedMinutes, { zero: '0 min' })} />
          <Row label="Temps prévu" value={formatDuration(day.expectedMinutes, { zero: '0 min' })} />
          <Row label="Heures sup. potentielles" value={formatDuration(day.overtimePotentialMinutes, { zero: 'Aucune' })} tone={day.overtimePotentialMinutes > 0 ? 'success' : undefined} />
          <Row label="État du pointage" value={labelOf(CLOCK_STATE, day.state)} />
          <Row label="Journée" value={day.isClosed ? 'Clôturée' : 'En cours'} />
          {day.corrected && (
            <p className="py-2 text-xs leading-relaxed text-muted">Cette journée a été régularisée par le service RH. Les heures affichées sont les heures retenues.</p>
          )}
        </dl>
      )}
    </li>
  );
}
