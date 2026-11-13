import { CalendarOff, Coffee, Info, PartyPopper, Plane, PowerOff, Timer } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Card, StatusBadge } from '@/components/ui';
import { formatDateLong, formatDuration, formatTime } from '@/lib/format';
import type { ClockStatus } from '@/lib/types';
import { cn } from '@/lib/utils';
import { isWorkingNow, useLiveMinutes } from '../useLiveMinutes';

function Notice({ icon: Icon, tone, title, children }: { icon: LucideIcon; tone: 'info' | 'warning' | 'brand' | 'muted'; title: string; children?: React.ReactNode }) {
  const tones = {
    info: 'border-sky-200 bg-sky-50 text-sky-900',
    warning: 'border-warning-border bg-warning-soft text-amber-900',
    brand: 'border-brand-200 bg-brand-50 text-brand-800',
    muted: 'border-slate-200 bg-slate-50 text-slate-700',
  } as const;
  return (
    <div className={cn('flex items-start gap-3 rounded-lg border px-3.5 py-3 text-sm', tones[tone])} role="status">
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0">
        <p className="font-semibold">{title}</p>
        {children && <p className="mt-0.5 leading-relaxed opacity-90">{children}</p>}
      </div>
    </div>
  );
}

function Metric({ label, value, sub, highlight }: { label: string; value: React.ReactNode; sub?: React.ReactNode; highlight?: boolean }) {
  return (
    <div className={cn('rounded-lg px-3 py-2.5', highlight ? 'bg-success-soft' : 'bg-slate-50')}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className="tabular mt-0.5 text-xl font-semibold tracking-tight text-ink">{value}</p>
      {sub && <p className="mt-0.5 truncate text-xs text-muted">{sub}</p>}
    </div>
  );
}

export function ClockStatusCard({ status, receivedAt }: { status: ClockStatus; receivedAt: number }) {
  const worked = useLiveMinutes(status, receivedAt);
  const live = isWorkingNow(status);
  const s = status.schedule;
  const openBreak = status.breaks.find((b) => !b.endAt);
  const leaveLabel = status.leave?.label ?? status.leave?.type;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3.5">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted">Aujourd'hui</p>
          <h2 className="truncate text-[15px] font-semibold text-ink">{formatDateLong(status.workDate)}</h2>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <StatusBadge kind="state" value={status.state} />
          {status.dayStatus !== 'EN_COURS' && status.state !== 'NON_POINTE' && <StatusBadge kind="day" value={status.dayStatus} dot={false} />}
        </div>
      </div>

      <div className="space-y-3 p-4">
        {!status.clockingEnabled && (
          <Notice icon={PowerOff} tone="warning" title="Pointage non activé">
            Le pointage n'est pas encore ouvert par votre entreprise. Rapprochez-vous des RH.
          </Notice>
        )}
        {status.holiday && (
          <Notice icon={PartyPopper} tone="muted" title={`Jour férié : ${status.holiday}`}>
            Aucun pointage n'est attendu aujourd'hui.
          </Notice>
        )}
        {status.leave && (
          <Notice icon={Plane} tone="brand" title={`En congé : ${leaveLabel ?? 'congé'}`}>
            Votre absence est couverte par une demande approuvée.
          </Notice>
        )}
        {!status.isWorkingDay && !status.holiday && !status.leave && (
          <Notice icon={CalendarOff} tone="muted" title="Jour non travaillé">
            Selon votre horaire, aujourd'hui n'est pas un jour ouvré. Un pointage serait signalé aux RH.
          </Notice>
        )}
        {openBreak && (
          <Notice icon={Coffee} tone="warning" title={`En pause depuis ${formatTime(openBreak.startAt)}`}>
            Pensez à pointer votre reprise.
          </Notice>
        )}

        <div className="grid grid-cols-3 gap-2">
          <Metric label="Arrivée" value={formatTime(status.arrivalAt)} sub={s ? `Prévue ${s.startTime}` : undefined} />
          <Metric label="Départ" value={formatTime(status.departureAt)} sub={s ? `Prévu ${s.endTime}` : undefined} />
          <Metric
            label="Travaillé"
            highlight={live}
            value={status.arrivalAt ? formatDuration(worked, { zero: '0 min' }) : '—'}
            sub={live ? (
              <span className="inline-flex items-center gap-1 text-success">
                <span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" /></span>
                En cours
              </span>
            ) : undefined}
          />
        </div>

        {status.lateMinutes > 0 && (
          <div className="flex items-center gap-2 rounded-lg bg-warning-soft px-3 py-2 text-sm text-amber-900">
            <Timer className="h-4 w-4 shrink-0" aria-hidden />
            Retard enregistré : <span className="tabular font-semibold">{formatDuration(status.lateMinutes)}</span>
          </div>
        )}

        {s ? (
          <p className="flex items-start gap-2 text-xs leading-relaxed text-muted">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              {s.name} : {s.startTime} – {s.endTime}
              {s.breakStart && s.breakEnd ? `, pause ${s.breakStart} – ${s.breakEnd}` : ''}
              {s.lateToleranceMin > 0 ? `, tolérance de retard ${s.lateToleranceMin} min` : ''}.
            </span>
          </p>
        ) : (
          <p className="text-xs text-muted">Aucun horaire n'est rattaché à votre fiche pour aujourd'hui.</p>
        )}

        {status.breakTracking && status.breaks.length > 0 && (
          <div className="border-t border-slate-100 pt-3">
            <p className="mb-1.5 text-xs font-medium text-muted">Pauses du jour</p>
            <ul className="space-y-1 text-sm">
              {status.breaks.map((b, i) => (
                <li key={b.startAt} className="tabular flex justify-between text-ink">
                  <span>Pause {i + 1}</span>
                  <span>{formatTime(b.startAt)} – {b.endAt ? formatTime(b.endAt) : 'en cours'}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}
