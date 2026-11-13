import * as React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, CalendarClock, Clock, History, PencilLine, ShieldCheck } from 'lucide-react';
import {
  Avatar, Badge, Button, Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle, Skeleton,
  StatusBadge, Tabs, TabsContent, TabsList, TabsTrigger,
} from '@/components/ui';
import { assetUrl } from '@/lib/api';
import { DAY_STATUS, labelOf, REVIEW_STATUS } from '@/lib/labels';
import { formatDateLong, formatDateTime, formatDuration, formatTime, formatWorkDays } from '@/lib/format';
import { QueryError, useIsHR } from '@/features/org/components/shared';
import { useAttendanceDetail, type AttendanceCorrection, type AttendanceDetail } from '../api';
import { fieldLabel } from '../labels';
import { CorrectionForm } from './CorrectionForm';
import { EventTimeline } from './EventTimeline';
import { ANOMALY_TYPE } from '@/features/anomalies/labels';

function fmtValue(v: string | null) {
  if (!v) return <span className="text-muted">vide</span>;
  if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return formatDateTime(v);
  if (v in DAY_STATUS) return labelOf(DAY_STATUS, v);
  return v;
}

function Metric({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'warning' | 'danger' | 'success' }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-0.5 text-[15px] font-semibold tabular ${tone === 'warning' ? 'text-warning-strong' : tone === 'danger' ? 'text-red-700' : tone === 'success' ? 'text-green-700' : 'text-ink'}`}>{value}</div>
    </div>
  );
}

function Corrections({ items }: { items: AttendanceCorrection[] }) {
  if (!items.length) return <p className="py-6 text-center text-sm text-muted">Aucune correction manuelle sur cette journée.</p>;
  return (
    <ul className="space-y-3">
      {items.map((c) => (
        <li key={c.id} className="rounded-lg border border-slate-200 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-semibold text-ink">{fieldLabel(c.field)}</span>
            <span className="text-xs text-muted">{formatDateTime(c.createdAt)} · {c.adminLogin ?? `Utilisateur #${c.adminUserId}`}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-500 line-through tabular">{fmtValue(c.oldValue)}</span>
            <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
            <span className="rounded bg-brand-50 px-2 py-0.5 font-medium text-brand-700 tabular">{fmtValue(c.newValue)}</span>
          </div>
          <p className="mt-2 text-sm text-slate-700"><span className="text-muted">Motif : </span>{c.reason}</p>
        </li>
      ))}
    </ul>
  );
}

function Body({ att, startInCorrect, onClose }: { att: AttendanceDetail; startInCorrect?: boolean; onClose: () => void }) {
  const isHR = useIsHR();
  const [mode, setMode] = React.useState<'view' | 'correct'>(startInCorrect && isHR ? 'correct' : 'view');
  const sv = att.scheduleVersion;
  const openAnomalies = att.anomalies.filter((a) => a.status === 'OUVERTE' || a.status === 'EN_COURS').length;

  return (
    <>
      <DialogHeader>
        <div className="flex items-start gap-3 pr-8">
          <Avatar name={att.employee.fullName} src={assetUrl(att.employee.photoUrl)} size="md" />
          <div className="min-w-0">
            <DialogTitle>{att.employee.fullName}</DialogTitle>
            <DialogDescription>
              {att.employee.matricule}{att.employee.departmentName ? ` · ${att.employee.departmentName}` : ''} · {formatDateLong(att.workDate)}
            </DialogDescription>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <StatusBadge kind="day" value={att.dayStatus} />
              <StatusBadge kind="state" value={att.state} />
              {att.corrected && <Badge variant="brand"><PencilLine className="h-3 w-3" />Corrigée</Badge>}
              {att.isClosed && <Badge variant="muted">Clôturée</Badge>}
            </div>
          </div>
        </div>
      </DialogHeader>
      <DialogBody className="space-y-5">
        {mode === 'correct' ? (
          <CorrectionForm att={att} onCancel={() => setMode('view')} onDone={() => setMode('view')} />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Metric label="Arrivée" value={formatTime(att.arrivalAt)} />
              <Metric label="Départ" value={formatTime(att.departureAt)} />
              <Metric label="Retard" value={att.lateMinutes ? formatDuration(att.lateMinutes) : '—'} tone={att.lateMinutes ? 'warning' : undefined} />
              <Metric label="Départ anticipé" value={att.earlyLeaveMinutes ? formatDuration(att.earlyLeaveMinutes) : '—'} tone={att.earlyLeaveMinutes ? 'warning' : undefined} />
              <Metric label="Présence" value={formatDuration(att.presenceMinutes)} />
              <Metric label="Pauses" value={formatDuration(att.breakMinutes)} />
              <Metric label="Travail effectif" value={formatDuration(att.workedMinutes)} />
              <Metric label="Heures sup. potentielles" value={att.overtimePotentialMinutes ? formatDuration(att.overtimePotentialMinutes) : '—'} tone={att.overtimePotentialMinutes ? 'success' : undefined} />
            </div>

            {isHR && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                <p className="text-sm text-slate-700">
                  {openAnomalies ? `${openAnomalies} anomalie(s) ouverte(s) sur cette journée.` : 'Régularisez les heures ou la qualification de cette journée.'}
                </p>
                <Button size="sm" leftIcon={<PencilLine />} onClick={() => setMode('correct')}>Corriger la journée</Button>
              </div>
            )}

            <Tabs defaultValue="events">
              <TabsList variant="underline" className="overflow-y-hidden">
                <TabsTrigger value="events"><Clock />Chronologie <span className="text-xs text-muted">({att.events.length})</span></TabsTrigger>
                <TabsTrigger value="corrections"><History />Corrections <span className="text-xs text-muted">({att.corrections.length})</span></TabsTrigger>
                <TabsTrigger value="anomalies"><AlertTriangle />Anomalies <span className="text-xs text-muted">({att.anomalies.length})</span></TabsTrigger>
                <TabsTrigger value="schedule"><CalendarClock />Horaire</TabsTrigger>
              </TabsList>
              <TabsContent value="events" className="pt-4">
                <EventTimeline events={att.events} />
                {att.breaks.length > 0 && (
                  <div className="mt-5 border-t border-slate-100 pt-4">
                    <h4 className="mb-2 text-sm font-semibold text-ink">Pauses</h4>
                    <ul className="space-y-1.5 text-sm">
                      {att.breaks.map((b, i) => (
                        <li key={b.id ?? i} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-1.5 tabular">
                          <span>{formatTime(b.startAt)} – {b.endAt ? formatTime(b.endAt) : <span className="text-warning-strong">non terminée</span>}</span>
                          {b.endAt && <span className="text-muted">{formatDuration(Math.round((new Date(b.endAt).getTime() - new Date(b.startAt).getTime()) / 60000))}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </TabsContent>
              <TabsContent value="corrections" className="pt-4"><Corrections items={att.corrections} /></TabsContent>
              <TabsContent value="anomalies" className="pt-4">
                {att.anomalies.length ? (
                  <ul className="space-y-2">
                    {att.anomalies.map((a) => (
                      <li key={a.id} className="rounded-lg border border-slate-200 p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-ink">{labelOf(ANOMALY_TYPE, a.type)}</span>
                          <StatusBadge kind="severity" value={a.severity} />
                          <StatusBadge kind="anomaly" value={a.status} />
                        </div>
                        <p className="mt-1 text-sm text-slate-700">{a.message}</p>
                        {a.resolutionNote && <p className="mt-1 text-xs text-muted">Note : {a.resolutionNote}</p>}
                      </li>
                    ))}
                  </ul>
                ) : <p className="py-6 text-center text-sm text-muted">Aucune anomalie liée à cette journée.</p>}
                {att.anomalies.length > 0 && (
                  <div className="mt-3 text-right">
                    <Link to={`/admin/anomalies?employeeId=${att.employeeId}&from=${att.workDate}&to=${att.workDate}`} onClick={onClose} className="text-sm font-medium text-brand hover:underline">
                      Ouvrir dans les anomalies
                    </Link>
                  </div>
                )}
              </TabsContent>
              <TabsContent value="schedule" className="pt-4">
                {sv ? (
                  <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                    <div className="flex justify-between gap-4 border-b border-slate-100 py-1.5"><dt className="text-muted">Version en vigueur depuis</dt><dd className="font-medium tabular">{sv.effectiveFrom.split('-').reverse().join('/')}</dd></div>
                    <div className="flex justify-between gap-4 border-b border-slate-100 py-1.5"><dt className="text-muted">Plage</dt><dd className="font-medium tabular">{sv.startTime} – {sv.endTime}</dd></div>
                    <div className="flex justify-between gap-4 border-b border-slate-100 py-1.5"><dt className="text-muted">Pause prévue</dt><dd className="font-medium tabular">{sv.breakStart && sv.breakEnd ? `${sv.breakStart} – ${sv.breakEnd}` : '—'}</dd></div>
                    <div className="flex justify-between gap-4 border-b border-slate-100 py-1.5"><dt className="text-muted">Jours travaillés</dt><dd className="font-medium">{formatWorkDays(sv.workDays)}</dd></div>
                    <div className="flex justify-between gap-4 border-b border-slate-100 py-1.5"><dt className="text-muted">Durée journalière</dt><dd className="font-medium">{formatDuration(sv.dailyMinutes)}</dd></div>
                    <div className="flex justify-between gap-4 border-b border-slate-100 py-1.5"><dt className="text-muted">Tolérance retard</dt><dd className="font-medium">{sv.lateToleranceMin} min</dd></div>
                    <div className="flex justify-between gap-4 border-b border-slate-100 py-1.5"><dt className="text-muted">Seuil heures sup.</dt><dd className="font-medium">{sv.overtimeThresholdMin} min</dd></div>
                    <div className="flex justify-between gap-4 border-b border-slate-100 py-1.5"><dt className="text-muted">Suivi des pauses</dt><dd className="font-medium">{sv.breakTracking ? `Oui (max. ${sv.maxBreaks})` : 'Non'}</dd></div>
                  </dl>
                ) : <p className="py-6 text-center text-sm text-muted">Aucun horaire applicable à cette date.</p>}
                {att.overtime && (
                  <div className="mt-4 flex items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm">
                    <ShieldCheck className="h-4 w-4 text-brand" />
                    Heures sup. : {formatDuration(att.overtime.potentialMinutes)} potentielles
                    {att.overtime.validatedMinutes != null && <> · {formatDuration(att.overtime.validatedMinutes)} validées</>}
                    <StatusBadge kind="review" value={att.overtime.status} className="ml-auto" />
                    <span className="sr-only">{labelOf(REVIEW_STATUS, att.overtime.status)}</span>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </DialogBody>
    </>
  );
}

/** Détail complet d'une journée de pointage (GET /attendance/:id) avec correction pour les RH. */
export function AttendanceDetailDialog({ id, open, onOpenChange, startInCorrect }: { id: number | null; open: boolean; onOpenChange: (o: boolean) => void; startInCorrect?: boolean }) {
  const q = useAttendanceDetail(open ? id : null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        {q.isLoading ? (
          <div className="space-y-4 p-6">
            <DialogTitle className="sr-only">Chargement de la journée</DialogTitle>
            <div className="flex gap-3"><Skeleton className="h-10 w-10 rounded-full" /><div className="space-y-2"><Skeleton className="h-4 w-48" /><Skeleton className="h-3 w-64" /></div></div>
            <div className="grid grid-cols-4 gap-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14" />)}</div>
            <Skeleton className="h-40" />
          </div>
        ) : q.error ? (
          <div className="p-6"><DialogTitle className="sr-only">Erreur</DialogTitle><QueryError error={q.error} onRetry={q.refetch} compact /></div>
        ) : q.data ? (
          <Body key={`${q.data.id}-${startInCorrect}`} att={q.data} startInCorrect={startInCorrect} onClose={() => onOpenChange(false)} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
