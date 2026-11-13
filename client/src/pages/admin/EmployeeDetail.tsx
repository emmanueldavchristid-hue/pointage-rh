import * as React from 'react';
import { useParams } from 'react-router-dom';
import {
  CalendarCheck, CalendarClock, CalendarOff, Camera, Clock, History, KeyRound, Pencil, Power, PowerOff, Printer, QrCode, RefreshCw, User,
} from 'lucide-react';
import {
  Avatar, Badge, Button, Card, CardContent, CardHeader, ConfirmDialog, DatePicker, EmptyState, PageHeader, Select, Skeleton, StatusBadge,
  Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow, TableSkeleton, Tabs, TabsContent, TabsList, TabsTrigger,
} from '@/components/ui';
import { assetUrl } from '@/lib/api';
import { CONTRACT_TYPE, GENDER, LEAVE_STATUS, ROLE_LABELS, SCHEDULE_SOURCE, labelOf } from '@/lib/labels';
import {
  addMonthsISO, currentMonthISO, formatDate, formatDateTime, formatDayShort, formatDuration, formatMonth, formatTime, formatWorkDays, monthRange, todayISO, addDaysISO,
} from '@/lib/format';
import type { Attendance, LeaveStatus } from '@/lib/types';
import { cn } from '@/lib/utils';
import { badgesUrl, useEmployee, useEmployeeQr, useRegenerateQr, useUploadPhoto, type EmployeeDetail } from '@/features/employees/api';
import { isEmployeeActive, useEmployeeActions } from '@/features/employees/components/useEmployeeActions';
import { useEmployeeAttendance, useEvents, type ScheduleVersion } from '@/features/attendance/api';
import { AttendanceDetailDialog } from '@/features/attendance/components/AttendanceDetailDialog';
import { EventTimeline } from '@/features/attendance/components/EventTimeline';
import { useAbsences, useEmployeeLeaves } from '@/features/absences/api';
import { InfoRow, QueryError, useIsHR } from '@/features/org/components/shared';

const ABSENCE_STATUSES = ['ABSENCE_NON_JUSTIFIEE', 'ABSENCE_JUSTIFIEE', 'CONGE', 'PERMISSION', 'MISSION'];

function Header({ emp }: { emp: EmployeeDetail }) {
  const isHR = useIsHR();
  const upload = useUploadPhoto();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const actions = useEmployeeActions();
  const sv = emp.schedule?.version && typeof emp.schedule.version === 'object' ? (emp.schedule.version as ScheduleVersion) : null;

  return (
    <Card className="mb-6">
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6">
        <div className="relative w-fit">
          <Avatar name={emp.fullName} src={assetUrl(emp.photoUrl)} size="xl" />
          {isHR && (
            <>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-ink text-white shadow-card hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                aria-label="Changer la photo"
                disabled={upload.isPending}
              >
                {upload.isPending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
              </button>
              <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) upload.mutate({ id: emp.id, file: f }); e.target.value = ''; }} />
            </>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-ink">{emp.fullName}</h1>
            <StatusBadge kind="employee" value={emp.status} />
            <Badge variant="muted">{ROLE_LABELS[emp.role] ?? emp.role}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted">
            {emp.positionTitle ?? 'Poste non renseigné'}{emp.departmentName ? ` · ${emp.departmentName}` : ''} · Matricule {emp.matricule}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-700">
              <CalendarClock className="h-3.5 w-3.5 text-brand" />
              {emp.schedule ? (
                <>
                  <span className="font-medium">{emp.schedule.name}</span>
                  {sv && <span className="tabular text-muted">{sv.startTime}–{sv.endTime} · {formatWorkDays(sv.workDays)}</span>}
                </>
              ) : 'Aucun horaire applicable'}
            </span>
            {emp.schedule?.source && <Badge variant="info">{labelOf(SCHEDULE_SOURCE, emp.schedule.source)}</Badge>}
          </div>
        </div>
        {isHR && (
          <div className="flex flex-wrap gap-2 sm:flex-col sm:items-stretch">
            <Button variant="outline" size="sm" leftIcon={<Pencil />} onClick={() => actions.edit(emp)}>Modifier</Button>
            <Button variant="outline" size="sm" leftIcon={<KeyRound />} onClick={() => actions.resetPassword(emp)}>Mot de passe</Button>
            {isEmployeeActive(emp)
              ? <Button variant="ghost" size="sm" className="text-danger hover:bg-danger-soft" leftIcon={<PowerOff />} onClick={() => actions.toggle(emp)}>Désactiver</Button>
              : <Button variant="ghost" size="sm" leftIcon={<Power />} onClick={() => actions.toggle(emp)}>Réactiver</Button>}
          </div>
        )}
      </div>
      {actions.dialogs}
    </Card>
  );
}

function GeneralTab({ emp }: { emp: EmployeeDetail }) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader title="Identité et coordonnées" />
        <CardContent>
          <dl className="divide-y divide-slate-100">
            <InfoRow label="Nom">{emp.lastName}</InfoRow>
            <InfoRow label="Prénoms">{emp.firstNames}</InfoRow>
            <InfoRow label="Genre">{emp.gender ? labelOf(GENDER, emp.gender) : '—'}</InfoRow>
            <InfoRow label="Date de naissance">{emp.birthDate ? formatDate(emp.birthDate) : '—'}</InfoRow>
            <InfoRow label="E-mail">{emp.email ?? '—'}</InfoRow>
            <InfoRow label="Téléphone">{emp.phone ?? '—'}</InfoRow>
          </dl>
        </CardContent>
      </Card>
      <Card>
        <CardHeader title="Emploi et compte" />
        <CardContent>
          <dl className="divide-y divide-slate-100">
            <InfoRow label="Département">{emp.departmentName ?? '—'}</InfoRow>
            <InfoRow label="Poste">{emp.positionTitle ?? '—'}</InfoRow>
            <InfoRow label="Contrat">{labelOf(CONTRACT_TYPE, emp.contractType)}</InfoRow>
            <InfoRow label="Date d'embauche">{emp.hireDate ? formatDate(emp.hireDate) : '—'}</InfoRow>
            <InfoRow label="Supérieur hiérarchique">{emp.managerName ?? '—'}</InfoRow>
            <InfoRow label="Identifiant de connexion"><span className="font-mono text-[13px]">{emp.user?.login ?? '—'}</span></InfoRow>
            <InfoRow label="Compte">{emp.user ? (emp.user.active ? 'Actif' : 'Désactivé') : '—'}</InfoRow>
            <InfoRow label="Dernière connexion">{emp.user?.lastLoginAt ? formatDateTime(emp.user.lastLoginAt) : 'Jamais connecté'}</InfoRow>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

function Total({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-card">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className={cn('mt-1 text-xl font-semibold tabular text-ink', tone)}>{value}</div>
    </div>
  );
}

function MonthPicker({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="icon-sm" onClick={() => onChange(addMonthsISO(month, -1))} aria-label="Mois précédent">‹</Button>
      <DatePicker type="month" value={month} onChange={(v) => v && onChange(v)} className="w-[170px]" aria-label="Mois" max={currentMonthISO()} />
      <Button variant="outline" size="icon-sm" onClick={() => onChange(addMonthsISO(month, 1))} disabled={month >= currentMonthISO()} aria-label="Mois suivant">›</Button>
    </div>
  );
}

function AttendanceTab({ id }: { id: number }) {
  const [month, setMonth] = React.useState(currentMonthISO());
  const { from, to } = monthRange(month);
  const q = useEmployeeAttendance(id, from, to > todayISO() ? todayISO() : to);
  const [openId, setOpenId] = React.useState<number | null>(null);
  const rows = [...(q.data ?? [])].sort((a, b) => b.workDate.localeCompare(a.workDate));
  const t = rows.reduce(
    (acc, a: Attendance) => {
      acc.worked += a.workedMinutes || 0;
      acc.expected += a.expectedMinutes || 0;
      if (a.lateMinutes > 0) { acc.lateCount++; acc.late += a.lateMinutes; }
      if (a.dayStatus === 'ABSENCE_NON_JUSTIFIEE') acc.absences++;
      if (a.arrivalAt) acc.present++;
      acc.ot += a.overtimePotentialMinutes || 0;
      return acc;
    },
    { worked: 0, expected: 0, lateCount: 0, late: 0, absences: 0, present: 0, ot: 0 },
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-ink">{formatMonth(month)}</h2>
        <MonthPicker month={month} onChange={setMonth} />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Total label="Jours de présence" value={q.isLoading ? <Skeleton className="h-6 w-10" /> : t.present} />
        <Total label="Travail effectif" value={q.isLoading ? <Skeleton className="h-6 w-16" /> : formatDuration(t.worked)} />
        <Total label="Temps attendu" value={q.isLoading ? <Skeleton className="h-6 w-16" /> : formatDuration(t.expected)} />
        <Total label="Retards" value={q.isLoading ? <Skeleton className="h-6 w-10" /> : `${t.lateCount} · ${formatDuration(t.late, { zero: '0 min' })}`} tone={t.lateCount ? 'text-warning-strong' : undefined} />
        <Total label="Absences injustifiées" value={q.isLoading ? <Skeleton className="h-6 w-10" /> : t.absences} tone={t.absences ? 'text-red-700' : undefined} />
        <Total label="HS potentielles" value={q.isLoading ? <Skeleton className="h-6 w-16" /> : formatDuration(t.ot, { zero: '0 min' })} />
      </div>
      <TableContainer>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Journée</TableHead>
              <TableHead>Qualification</TableHead>
              <TableHead align="right">Arrivée</TableHead>
              <TableHead align="right">Départ</TableHead>
              <TableHead align="right">Retard</TableHead>
              <TableHead align="right">Effectif</TableHead>
              <TableHead align="right" className="hidden sm:table-cell">HS pot.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.isLoading ? <tr><td colSpan={7}><TableSkeleton rows={6} cols={6} /></td></tr>
              : q.error ? <tr><td colSpan={7}><QueryError error={q.error} onRetry={q.refetch} compact /></td></tr>
              : !rows.length ? <tr><td colSpan={7}><EmptyState compact icon={Clock} title="Aucune journée sur ce mois" /></td></tr>
              : rows.map((a) => (
                <TableRow key={a.id} clickable onClick={() => setOpenId(a.id)}>
                  <TableCell className="whitespace-nowrap font-medium">{formatDayShort(a.workDate)}</TableCell>
                  <TableCell><StatusBadge kind="day" value={a.dayStatus} /></TableCell>
                  <TableCell align="right" className="tabular">{formatTime(a.arrivalAt)}</TableCell>
                  <TableCell align="right" className="tabular">{formatTime(a.departureAt)}</TableCell>
                  <TableCell align="right" className={cn('tabular', a.lateMinutes ? 'text-warning-strong' : 'text-muted')}>{a.lateMinutes ? formatDuration(a.lateMinutes) : '—'}</TableCell>
                  <TableCell align="right" className="tabular">{a.workedMinutes ? formatDuration(a.workedMinutes) : '—'}</TableCell>
                  <TableCell align="right" className="hidden tabular sm:table-cell">{a.overtimePotentialMinutes ? formatDuration(a.overtimePotentialMinutes) : '—'}</TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </TableContainer>
      <AttendanceDetailDialog id={openId} open={!!openId} onOpenChange={(o) => !o && setOpenId(null)} />
    </div>
  );
}

function AbsencesTab({ id }: { id: number }) {
  const [month, setMonth] = React.useState(currentMonthISO());
  const { from, to } = monthRange(month);
  const q = useAbsences({ employeeId: String(id), from, to, pageSize: 100 });
  // Repli : si /absences n'est pas encore disponible, on filtre les journées de l'employé.
  const fallback = useEmployeeAttendance(id, from, to > todayISO() ? todayISO() : to);
  const notReady = q.error && (q.error as { status?: number }).status === 404;
  const rows = (notReady ? (fallback.data ?? []).filter((a) => ABSENCE_STATUSES.includes(a.dayStatus)) : q.data?.items ?? [])
    .slice().sort((a, b) => b.workDate.localeCompare(a.workDate));
  const loading = q.isLoading || (notReady && fallback.isLoading);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-ink">Absences · {formatMonth(month)}</h2>
        <MonthPicker month={month} onChange={setMonth} />
      </div>
      <TableContainer>
        <Table>
          <TableHeader><TableRow><TableHead>Journée</TableHead><TableHead>Qualification</TableHead><TableHead>Justificatif</TableHead></TableRow></TableHeader>
          <TableBody>
            {loading ? <tr><td colSpan={3}><TableSkeleton rows={4} cols={3} /></td></tr>
              : q.error && !notReady ? <tr><td colSpan={3}><QueryError error={q.error} onRetry={q.refetch} compact /></td></tr>
              : !rows.length ? <tr><td colSpan={3}><EmptyState compact icon={CalendarOff} title="Aucune absence sur ce mois" /></td></tr>
              : rows.map((a) => {
                const j = (a as { justification?: { status: string; fileName: string | null } | null }).justification;
                return (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{formatDayShort(a.workDate)}</TableCell>
                    <TableCell><StatusBadge kind="day" value={a.dayStatus} /></TableCell>
                    <TableCell>{j ? <StatusBadge kind="review" value={j.status} /> : <span className="text-sm text-muted">Aucun</span>}</TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </Table>
      </TableContainer>
    </div>
  );
}

function LeavesTab({ id }: { id: number }) {
  const q = useEmployeeLeaves(id);
  const rows = q.data ?? [];
  return (
    <TableContainer>
      <Table>
        <TableHeader>
          <TableRow><TableHead>Type</TableHead><TableHead>Période</TableHead><TableHead align="right">Jours ouvrés</TableHead><TableHead>Statut</TableHead><TableHead className="hidden md:table-cell">Demandé le</TableHead></TableRow>
        </TableHeader>
        <TableBody>
          {q.isLoading ? <tr><td colSpan={5}><TableSkeleton rows={4} cols={4} /></td></tr>
            : q.error ? <tr><td colSpan={5}><QueryError error={q.error} onRetry={q.refetch} compact label="Congés" /></td></tr>
            : !rows.length ? <tr><td colSpan={5}><EmptyState compact icon={CalendarCheck} title="Aucune demande de congé" /></td></tr>
            : rows.map((l) => (
              <TableRow key={l.id}>
                <TableCell>
                  <span className="inline-flex items-center gap-2 font-medium">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: l.leaveType.color ?? '#94A3B8' }} aria-hidden />
                    {l.leaveType.label}
                  </span>
                </TableCell>
                <TableCell className="whitespace-nowrap tabular">{formatDate(l.startDate)} – {formatDate(l.endDate)}</TableCell>
                <TableCell align="right" className="tabular">{l.workingDays}</TableCell>
                <TableCell><StatusBadge kind="leave" value={l.status as LeaveStatus} /><span className="sr-only">{labelOf(LEAVE_STATUS, l.status)}</span></TableCell>
                <TableCell className="hidden text-muted md:table-cell">{formatDate(l.createdAt)}</TableCell>
              </TableRow>
            ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function HistoryTab({ id }: { id: number }) {
  const [days, setDays] = React.useState('7');
  const [result, setResult] = React.useState('');
  const today = todayISO();
  const q = useEvents({ employeeId: String(id), from: addDaysISO(today, -Number(days) + 1), to: today, result, pageSize: 200 });
  return (
    <Card>
      <CardHeader
        title="Journal des événements de pointage"
        description="Scans acceptés et refusés, avec motif, source, emplacement et adresse IP."
        actions={
          <div className="flex flex-wrap gap-2">
            <Select value={days} onValueChange={setDays} className="w-[150px]" aria-label="Période"
              options={[{ value: '7', label: '7 derniers jours' }, { value: '30', label: '30 derniers jours' }, { value: '90', label: '90 derniers jours' }]} />
            <Select value={result} onValueChange={setResult} allLabel="Tous" className="w-[130px]" aria-label="Résultat"
              options={[{ value: 'ACCEPTE', label: 'Acceptés' }, { value: 'REFUSE', label: 'Refusés' }]} />
          </div>
        }
      />
      <CardContent>
        {q.isLoading ? <TableSkeleton rows={5} cols={2} />
          : q.error ? <QueryError error={q.error} onRetry={q.refetch} compact />
          : <EventTimeline events={q.data?.items ?? []} showDate />}
      </CardContent>
    </Card>
  );
}

function QrTab({ emp }: { emp: EmployeeDetail }) {
  const q = useEmployeeQr(emp.id, true);
  const regen = useRegenerateQr();
  const [confirm, setConfirm] = React.useState(false);
  return (
    <Card>
      <CardHeader
        title="QR Code personnel"
        description="Badge de secours permettant le pointage à une borne surveillée par les RH."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" leftIcon={<Printer />} onClick={() => window.open(badgesUrl([emp.id]), '_blank', 'noopener')}>Imprimer le badge</Button>
            <Button variant="outline" size="sm" leftIcon={<RefreshCw />} onClick={() => setConfirm(true)}>Régénérer</Button>
          </div>
        }
      />
      <CardContent>
        {q.isLoading ? <Skeleton className="mx-auto h-56 w-56" />
          : q.error ? <QueryError error={q.error} onRetry={q.refetch} compact />
          : q.data ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-card">
                <img src={q.data.png} alt={`QR Code personnel de ${emp.fullName}`} className="h-56 w-56 [image-rendering:pixelated]" />
              </div>
              <div className="text-center">
                <div className="font-semibold text-ink">{emp.fullName}</div>
                <div className="text-sm text-muted">{emp.matricule}</div>
              </div>
            </div>
          ) : null}
      </CardContent>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Régénérer le QR Code personnel ?"
        description="L'ancien QR Code et les badges imprimés deviendront immédiatement inutilisables. Un nouveau badge devra être remis à l'employé."
        confirmLabel="Régénérer"
        onConfirm={() => regen.mutateAsync(emp.id)}
      />
    </Card>
  );
}

export default function AdminEmployeeDetailPage() {
  const { id } = useParams();
  const empId = Number(id);
  const q = useEmployee(empId);
  const isHR = useIsHR();

  if (q.isLoading) {
    return (
      <div>
        <PageHeader title={<Skeleton className="h-7 w-48" />} backTo="/admin/employees" backLabel="Employés" className="[&_h1]:hidden" />
        <Card className="mb-6 p-6"><div className="flex gap-5"><Skeleton className="h-20 w-20 rounded-full" /><div className="flex-1 space-y-3"><Skeleton className="h-7 w-64" /><Skeleton className="h-4 w-80" /><Skeleton className="h-7 w-72" /></div></div></Card>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (q.error || !q.data) {
    return (
      <div>
        <PageHeader title="Fiche employé" backTo="/admin/employees" backLabel="Employés" />
        <Card><QueryError error={q.error} onRetry={q.refetch} /></Card>
      </div>
    );
  }
  const emp = q.data;

  return (
    <div>
      <PageHeader title="" backTo="/admin/employees" backLabel="Employés" className="mb-4 [&_h1]:hidden" />
      <Header emp={emp} />
      <Tabs defaultValue="general">
        <TabsList variant="underline" className="mb-5">
          <TabsTrigger value="general"><User />Informations</TabsTrigger>
          <TabsTrigger value="attendance"><Clock />Présence</TabsTrigger>
          <TabsTrigger value="absences"><CalendarOff />Absences</TabsTrigger>
          <TabsTrigger value="leaves"><CalendarCheck />Congés</TabsTrigger>
          <TabsTrigger value="history"><History />Historique</TabsTrigger>
          {isHR && <TabsTrigger value="qr"><QrCode />QR Code</TabsTrigger>}
        </TabsList>
        <TabsContent value="general"><GeneralTab emp={emp} /></TabsContent>
        <TabsContent value="attendance"><AttendanceTab id={emp.id} /></TabsContent>
        <TabsContent value="absences"><AbsencesTab id={emp.id} /></TabsContent>
        <TabsContent value="leaves"><LeavesTab id={emp.id} /></TabsContent>
        <TabsContent value="history"><HistoryTab id={emp.id} /></TabsContent>
        {isHR && <TabsContent value="qr"><QrTab emp={emp} /></TabsContent>}
      </Tabs>
    </div>
  );
}

