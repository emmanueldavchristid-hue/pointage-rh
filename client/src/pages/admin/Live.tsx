import * as React from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  CalendarOff, Clock, Coffee, DoorOpen, Hourglass, LogOut, RefreshCw, TimerOff, UserCheck, UserX, AlertCircle,
  type LucideIcon,
} from 'lucide-react';
import {
  Avatar, Badge, Button, Card, DatePicker, EmptyState, PageHeader, Select, Skeleton, StatusBadge, Table, TableBody, TableCell,
  TableContainer, TableHead, TableHeader, TableRow,
} from '@/components/ui';
import { assetUrl } from '@/lib/api';
import { formatDateLong, formatDuration, formatTime, formatTimeSeconds, todayISO } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Attendance } from '@/lib/types';
import { useLive, type LiveResponse } from '@/features/attendance/api';
import { AttendanceDetailDialog } from '@/features/attendance/components/AttendanceDetailDialog';
import { useDepartmentOptions } from '@/features/org/api';
import { QueryError } from '@/features/org/components/shared';

type TabKey = 'present' | 'notArrived' | 'late' | 'earlyLeave' | 'onBreak' | 'incomplete' | 'onLeave' | 'absent' | 'departed';

const TABS: { key: TabKey; label: string; icon: LucideIcon; tone: string }[] = [
  { key: 'present', label: 'Présents', icon: UserCheck, tone: 'text-success' },
  { key: 'notArrived', label: 'Pas encore arrivés', icon: Hourglass, tone: 'text-slate-500' },
  { key: 'late', label: 'Retards', icon: Clock, tone: 'text-warning-strong' },
  { key: 'earlyLeave', label: 'Départs anticipés', icon: TimerOff, tone: 'text-warning-strong' },
  { key: 'onBreak', label: 'En pause', icon: Coffee, tone: 'text-sky-600' },
  { key: 'incomplete', label: 'Pointages incomplets', icon: AlertCircle, tone: 'text-warning-strong' },
  { key: 'onLeave', label: 'En congé', icon: CalendarOff, tone: 'text-brand' },
  { key: 'absent', label: 'Absents', icon: UserX, tone: 'text-danger' },
  { key: 'departed', label: 'Partis', icon: LogOut, tone: 'text-slate-500' },
];

const EMPTY_TEXT: Record<TabKey, string> = {
  present: 'Aucun employé présent pour le moment.',
  notArrived: 'Tous les employés attendus sont arrivés.',
  late: 'Aucun retard enregistré.',
  earlyLeave: 'Aucun départ anticipé.',
  onBreak: 'Personne n’est en pause.',
  incomplete: 'Aucun pointage incomplet.',
  onLeave: 'Aucun employé en congé ou en permission.',
  absent: 'Aucune absence constatée.',
  departed: 'Aucun départ enregistré.',
};

function listFor(d: LiveResponse, k: TabKey): unknown[] {
  return ((d as unknown as Record<string, unknown[]>)[k] ?? []) as unknown[];
}
function countFor(d: LiveResponse, k: TabKey) {
  return d.counts?.[k] ?? listFor(d, k).length;
}

type Row = Partial<Attendance> & {
  employeeId: number; fullName?: string; matricule?: string; departmentName?: string | null; photoUrl?: string | null;
  expectedStart?: string | null; leave?: string; attendanceId?: number;
};

function Person({ r }: { r: Row }) {
  const name = r.employee?.fullName ?? r.fullName ?? '—';
  const mat = r.employee?.matricule ?? r.matricule;
  const dep = r.employee?.departmentName ?? r.departmentName;
  return (
    <div className="flex items-center gap-3">
      <Avatar name={name} src={assetUrl(r.employee?.photoUrl ?? r.photoUrl)} size="sm" />
      <div className="min-w-0">
        <div className="truncate font-medium text-ink">{name}</div>
        <div className="truncate text-xs text-muted">{mat}{dep ? ` · ${dep}` : ''}</div>
      </div>
    </div>
  );
}

export default function AdminLivePage() {
  const [sp, setSp] = useSearchParams();
  const date = sp.get('date') || todayISO();
  const departmentId = sp.get('departmentId') ?? '';
  const tab = (sp.get('tab') as TabKey) || 'present';
  const deptOptions = useDepartmentOptions();
  const q = useLive({ date: date === todayISO() ? undefined : date, departmentId });
  const [openId, setOpenId] = React.useState<number | null>(null);

  const setParam = (k: string, v: string) => setSp((p) => { const n = new URLSearchParams(p); if (v) n.set(k, v); else n.delete(k); return n; }, { replace: true });
  const isToday = date === todayISO();
  const rows = (q.data ? listFor(q.data, tab) : []) as Row[];
  const isBrief = tab === 'notArrived' || tab === 'onLeave' || tab === 'absent';

  return (
    <div>
      <PageHeader
        title="Présences du jour"
        description={formatDateLong(date)}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <DatePicker value={date} max={todayISO()} onChange={(v) => setParam('date', v === todayISO() ? '' : v)} className="w-[160px]" aria-label="Date" />
            <Select value={departmentId} onValueChange={(v) => setParam('departmentId', v)} options={deptOptions} allLabel="Tous les départements" className="w-[210px]" aria-label="Département" />
            <Button variant="outline" size="icon" onClick={() => q.refetch()} aria-label="Actualiser" disabled={q.isFetching}>
              <RefreshCw className={cn(q.isFetching && 'animate-spin')} />
            </Button>
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          {isToday && <span className="inline-flex items-center gap-1.5"><span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-success" /></span>Actualisation automatique toutes les 30 secondes</span>}
          {q.dataUpdatedAt > 0 && <span>· Mis à jour à {formatTimeSeconds(new Date(q.dataUpdatedAt))}</span>}
          {q.data?.holiday && <Badge variant="info">Jour férié : {q.data.holiday}</Badge>}
          {q.data?.counts?.scheduled !== undefined && <span>· {q.data.counts.scheduled} attendu(s) sur {q.data.counts.active} actif(s)</span>}
        </div>
      </PageHeader>

      {q.error && !q.data ? (
        <Card><QueryError error={q.error} onRetry={q.refetch} /></Card>
      ) : (
        <>
          <div role="tablist" aria-label="Catégories" className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9">
            {TABS.map((t) => {
              const active = t.key === tab;
              return (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setParam('tab', t.key === 'present' ? '' : t.key)}
                  className={cn(
                    'flex min-h-[44px] flex-col items-start rounded-xl border bg-white px-3 py-2.5 text-left shadow-card transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30',
                    active ? 'border-brand ring-1 ring-brand' : 'border-slate-200 hover:border-slate-300',
                  )}
                >
                  <span className="flex items-center gap-1.5 text-xs font-medium text-muted"><t.icon className={cn('h-3.5 w-3.5', t.tone)} />{t.label}</span>
                  {q.isLoading ? <Skeleton className="mt-1 h-6 w-8" /> : <span className="mt-0.5 text-xl font-semibold tabular text-ink">{q.data ? countFor(q.data, t.key) : '—'}</span>}
                </button>
              );
            })}
          </div>

          <TableContainer>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employé</TableHead>
                  {tab === 'notArrived' && <TableHead align="right">Heure attendue</TableHead>}
                  {tab === 'onLeave' && <TableHead>Motif</TableHead>}
                  {tab === 'absent' && <TableHead>Qualification</TableHead>}
                  {!isBrief && (
                    <>
                      <TableHead>État</TableHead>
                      <TableHead align="right">Arrivée</TableHead>
                      <TableHead align="right">Départ</TableHead>
                      <TableHead align="right">{tab === 'earlyLeave' ? 'Départ anticipé' : 'Retard'}</TableHead>
                      <TableHead align="right" className="hidden md:table-cell">Travail effectif</TableHead>
                    </>
                  )}
                  <TableHead align="right"><span className="sr-only">Détail</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}><TableCell colSpan={7}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
                  ))
                ) : !rows.length ? (
                  <tr><td colSpan={7}><EmptyState compact icon={DoorOpen} title={EMPTY_TEXT[tab]} /></td></tr>
                ) : rows.map((r) => {
                  const attId = (isBrief ? r.attendanceId : r.id) ?? null;
                  return (
                    <TableRow key={`${r.employeeId}-${attId ?? ''}`} clickable={!!attId} onClick={() => attId && setOpenId(attId)}>
                      <TableCell><Person r={r} /></TableCell>
                      {tab === 'notArrived' && <TableCell align="right" className="tabular font-medium">{r.expectedStart ?? '—'}</TableCell>}
                      {tab === 'onLeave' && <TableCell><Badge variant="brand">{r.leave ?? 'Congé'}</Badge></TableCell>}
                      {tab === 'absent' && <TableCell>{r.dayStatus ? <StatusBadge kind="day" value={r.dayStatus} /> : '—'}</TableCell>}
                      {!isBrief && (
                        <>
                          <TableCell>{r.state && <StatusBadge kind="state" value={r.state} />}</TableCell>
                          <TableCell align="right" className="tabular">{formatTime(r.arrivalAt)}</TableCell>
                          <TableCell align="right" className="tabular">{formatTime(r.departureAt)}</TableCell>
                          <TableCell align="right" className="tabular">
                            {tab === 'earlyLeave'
                              ? (r.earlyLeaveMinutes ? <span className="font-medium text-warning-strong">{formatDuration(r.earlyLeaveMinutes)}</span> : '—')
                              : (r.lateMinutes ? <span className="font-medium text-warning-strong">{formatDuration(r.lateMinutes)}</span> : '—')}
                          </TableCell>
                          <TableCell align="right" className="hidden tabular md:table-cell">{r.workedMinutes ? formatDuration(r.workedMinutes) : '—'}</TableCell>
                        </>
                      )}
                      <TableCell align="right">
                        {attId ? (
                          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setOpenId(attId); }}>Détail</Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </>
      )}
      <AttendanceDetailDialog id={openId} open={!!openId} onOpenChange={(o) => !o && setOpenId(null)} />
    </div>
  );
}
