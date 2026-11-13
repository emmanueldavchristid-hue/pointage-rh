import { CheckCircle2, MapPin, MonitorSmartphone, Network, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui';
import { formatDate, formatTimeSeconds } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { AttendanceEvent } from '../api';
import { EVENT_SOURCE, EVENT_TYPE } from '../labels';
import { labelOf } from '@/lib/labels';

/** Chronologie des événements de pointage : acceptés, refusés (avec motif) et remplacés (barrés). */
export function EventTimeline({ events, showDate }: { events: AttendanceEvent[]; showDate?: boolean }) {
  const sorted = [...events].sort((a, b) => a.serverTime.localeCompare(b.serverTime));
  if (!sorted.length) return <p className="py-6 text-center text-sm text-muted">Aucun événement de pointage enregistré pour cette journée.</p>;
  return (
    <ol className="relative space-y-0">
      {sorted.map((ev, i) => {
        const refused = ev.result !== 'ACCEPTE';
        const superseded = !!ev.supersededBy;
        const admin = ev.source?.startsWith('ADMIN');
        return (
          <li key={String(ev.id)} className="relative flex gap-3 pb-5 last:pb-0">
            {i < sorted.length - 1 && <span className="absolute left-[11px] top-6 h-[calc(100%-12px)] w-px bg-slate-200" aria-hidden />}
            <span
              className={cn(
                'relative z-[1] mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-4 ring-white',
                refused ? 'bg-danger-soft text-danger' : superseded ? 'bg-slate-100 text-slate-400' : admin ? 'bg-brand-50 text-brand' : 'bg-success-soft text-success',
              )}
            >
              {refused ? <XCircle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className={cn('text-sm font-semibold tabular text-ink', superseded && 'text-slate-400 line-through')}>
                  {showDate && <span className="mr-1.5 font-normal text-muted">{formatDate(ev.workDate)}</span>}
                  {formatTimeSeconds(ev.serverTime)}
                </span>
                <span className={cn('text-sm text-ink', superseded && 'text-slate-400 line-through')}>{labelOf(EVENT_TYPE, ev.type)}</span>
                {refused && <Badge variant="danger">Refusé</Badge>}
                {superseded && <Badge variant="muted">Remplacé</Badge>}
                {admin && !refused && <Badge variant="brand">{labelOf(EVENT_SOURCE, ev.source)}</Badge>}
              </div>
              {refused && ev.reasonMessage && (
                <p className="mt-1 text-sm text-red-700">
                  {ev.reasonMessage}
                  {ev.reasonCode && <span className="ml-1.5 font-mono text-[11px] text-red-500">{ev.reasonCode}</span>}
                </p>
              )}
              {!refused && admin && ev.reasonMessage && <p className="mt-1 text-sm text-slate-700">Motif : {ev.reasonMessage}</p>}
              {ev.employee && <p className="mt-0.5 text-xs text-muted">{ev.employee.fullName} · {ev.employee.matricule}</p>}
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                {!admin && <span className="inline-flex items-center gap-1"><MonitorSmartphone className="h-3 w-3" />{labelOf(EVENT_SOURCE, ev.source)}</span>}
                {ev.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{ev.location}</span>}
                {ev.ip && <span className="inline-flex items-center gap-1 font-mono"><Network className="h-3 w-3" />{ev.ip}</span>}
                {ev.deviceId && <span className="truncate font-mono" title={ev.deviceId}>Appareil {ev.deviceId.slice(0, 8)}</span>}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
