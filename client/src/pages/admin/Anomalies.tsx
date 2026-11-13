import * as React from 'react';
import { CheckCircle2, PencilLine, ScanSearch, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import {
  Avatar, Button, Card, DatePicker, DateRangePicker, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle, EmptyState, FilterBar, FormField, PageHeader, Pagination, Select, StatusBadge, Table, TableBody, TableCell, TableContainer,
  TableHead, TableHeader, TableRow, TableSkeleton, Textarea,
} from '@/components/ui';
import { ANOMALY_STATUS, SEVERITY, labelOf } from '@/lib/labels';
import { addDaysISO, formatDate, formatDateTime, todayISO } from '@/lib/format';
import { errorMessage } from '@/lib/api';
import { useAnomalies, useResolveAnomaly, useRunDetection, type Anomaly } from '@/features/anomalies/api';
import { ANOMALY_TYPE } from '@/features/anomalies/labels';
import { AttendanceDetailDialog } from '@/features/attendance/components/AttendanceDetailDialog';
import { useDepartmentOptions, useEmployeeSelectOptions } from '@/features/org/api';
import { QueryError, useIsHR } from '@/features/org/components/shared';
import { useUrlState } from '@/features/org/useUrlState';
import { cn } from '@/lib/utils';

const statusOptions = Object.entries(ANOMALY_STATUS).map(([value, d]) => ({ value, label: d.label }));
const severityOptions = Object.entries(SEVERITY).map(([value, d]) => ({ value, label: d.label }));
const typeOptions = Object.entries(ANOMALY_TYPE).map(([value, label]) => ({ value, label }));

const SEVERITY_BAR: Record<string, string> = { FAIBLE: 'bg-slate-300', MOYENNE: 'bg-warning', ELEVEE: 'bg-danger', CRITIQUE: 'bg-red-800' };

function ResolveDialog({ anomaly, onOpenChange }: { anomaly: Anomaly | null; onOpenChange: (o: boolean) => void }) {
  const [status, setStatus] = React.useState<'RESOLUE' | 'IGNOREE' | 'EN_COURS'>('RESOLUE');
  const [note, setNote] = React.useState('');
  const [touched, setTouched] = React.useState(false);
  const mut = useResolveAnomaly();
  React.useEffect(() => { if (anomaly) { setStatus('RESOLUE'); setNote(''); setTouched(false); } }, [anomaly]);
  const invalid = note.trim().length < 3;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (!anomaly || invalid) return;
    try {
      await mut.mutateAsync({ id: anomaly.id, status, note: note.trim() });
      onOpenChange(false);
    } catch { /* toast automatique */ }
  }

  return (
    <Dialog open={!!anomaly} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <form onSubmit={submit} className="flex min-h-0 flex-col" noValidate>
          <DialogHeader>
            <DialogTitle>Traiter l'anomalie</DialogTitle>
            {anomaly && (
              <DialogDescription>
                {labelOf(ANOMALY_TYPE, anomaly.type)} · {anomaly.employee.fullName} · {formatDate(anomaly.workDate)}
              </DialogDescription>
            )}
          </DialogHeader>
          <DialogBody className="space-y-4">
            {anomaly && <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{anomaly.message}</p>}
            <FormField label="Nouveau statut" htmlFor="res-status" required>
              <Select
                id="res-status"
                value={status}
                onValueChange={(v) => setStatus(v as typeof status)}
                options={[
                  { value: 'RESOLUE', label: 'Résolue' },
                  { value: 'EN_COURS', label: 'En cours de traitement' },
                  { value: 'IGNOREE', label: 'Ignorée (sans suite)' },
                ]}
              />
            </FormField>
            <FormField label="Note de traitement" htmlFor="res-note" required error={touched && invalid ? 'La note est obligatoire (3 caractères minimum).' : null}>
              <Textarea id="res-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => setTouched(true)} placeholder="Décrivez l'action menée ou la raison du classement." aria-invalid={touched && invalid} />
            </FormField>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mut.isPending}>Annuler</Button>
            <Button type="submit" loading={mut.isPending}>Enregistrer</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DetectionDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [date, setDate] = React.useState(addDaysISO(todayISO(), -1));
  const mut = useRunDetection();
  async function run() {
    try {
      const r = await mut.mutateAsync(date);
      const n = (r?.created ?? r?.detected) as number | undefined;
      toast.success(typeof n === 'number' ? `Détection terminée : ${n} anomalie(s) détectée(s).` : 'Détection des anomalies relancée.');
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Relancer la détection</DialogTitle>
          <DialogDescription>Analyse à nouveau les pointages de la journée choisie. Les anomalies déjà traitées sont conservées.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <FormField label="Journée à analyser" htmlFor="det-date">
            <DatePicker id="det-date" value={date} max={todayISO()} onChange={setDate} />
          </FormField>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mut.isPending}>Annuler</Button>
          <Button onClick={run} loading={mut.isPending} leftIcon={<ScanSearch />}>Lancer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminAnomaliesPage() {
  const defaults = React.useMemo(() => ({ status: 'OUVERTE', type: '', severity: '', from: '', to: '', departmentId: '', employeeId: '' }), []);
  const { values: f, set, page, setPage, reset, dirty } = useUrlState(defaults);
  const [pageSize, setPageSize] = React.useState(25);
  const q = useAnomalies({ ...f, page, pageSize });
  const deptOptions = useDepartmentOptions();
  const empOptions = useEmployeeSelectOptions();
  const isHR = useIsHR();
  const [resolving, setResolving] = React.useState<Anomaly | null>(null);
  const [regularize, setRegularize] = React.useState<number | null>(null);
  const [detectOpen, setDetectOpen] = React.useState(false);

  return (
    <div>
      <PageHeader
        title="Anomalies"
        description="Incohérences de pointage détectées automatiquement : oublis, doublons, pointages hors horaire ou hors réseau."
        actions={isHR && <Button variant="outline" leftIcon={<ScanSearch />} onClick={() => setDetectOpen(true)}>Relancer la détection</Button>}
      />
      <Card className="overflow-hidden">
        <FilterBar onReset={reset} canReset={dirty}>
          <Select className="sm:w-[200px]" value={f.status} onValueChange={(v) => set({ status: v })} options={statusOptions} allLabel="Tous les statuts" aria-label="Statut" />
          <Select className="sm:w-[200px]" value={f.type} onValueChange={(v) => set({ type: v })} options={typeOptions} allLabel="Tous les types" aria-label="Type" />
          <Select className="sm:w-[200px]" value={f.severity} onValueChange={(v) => set({ severity: v })} options={severityOptions} allLabel="Toutes gravités" aria-label="Gravité" />
          {isHR && <Select className="sm:w-[200px]" value={f.departmentId} onValueChange={(v) => set({ departmentId: v })} options={deptOptions} allLabel="Tous les départements" aria-label="Département" />}
          <Select className="sm:w-[200px]" value={f.employeeId} onValueChange={(v) => set({ employeeId: v })} options={empOptions} allLabel="Tous les employés" aria-label="Employé" />
          <DateRangePicker from={f.from} to={f.to} onChange={(r) => set({ from: r.from, to: r.to })} />
        </FilterBar>
        <TableContainer className="rounded-none border-0 shadow-none">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Anomalie</TableHead>
                <TableHead>Employé</TableHead>
                <TableHead>Journée</TableHead>
                <TableHead>Gravité</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead align="right"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.isLoading ? (
                <tr><td colSpan={6}><TableSkeleton rows={6} cols={5} /></td></tr>
              ) : q.error ? (
                <tr><td colSpan={6}><QueryError error={q.error} onRetry={q.refetch} compact label="Anomalies" /></td></tr>
              ) : !q.data?.items.length ? (
                <tr><td colSpan={6}><EmptyState compact icon={CheckCircle2} title="Aucune anomalie" description="Aucune anomalie ne correspond à ces filtres." /></td></tr>
              ) : q.data.items.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="min-w-[240px] max-w-[420px]">
                    <div className="flex gap-3">
                      <span className={cn('mt-1 h-8 w-1 shrink-0 rounded-full', SEVERITY_BAR[a.severity] ?? 'bg-slate-300')} aria-hidden />
                      <div className="min-w-0">
                        <div className="font-medium text-ink">{labelOf(ANOMALY_TYPE, a.type)}</div>
                        <div className="line-clamp-2 text-xs text-muted">{a.message}</div>
                        {a.resolutionNote && <div className="mt-0.5 line-clamp-1 text-xs text-slate-600">Note : {a.resolutionNote}</div>}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <Avatar name={a.employee.fullName} size="sm" />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-ink">{a.employee.fullName}</div>
                        <div className="truncate text-xs text-muted">{a.employee.departmentName ?? a.employee.matricule}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <div className="text-sm">{formatDate(a.workDate)}</div>
                    <div className="text-xs text-muted">Détectée {formatDateTime(a.detectedAt)}</div>
                  </TableCell>
                  <TableCell><StatusBadge kind="severity" value={a.severity} /></TableCell>
                  <TableCell><StatusBadge kind="anomaly" value={a.status} /></TableCell>
                  <TableCell align="right">
                    <div className="flex justify-end gap-1">
                      {a.attendanceId && (
                        <Button variant="ghost" size="sm" leftIcon={<PencilLine />} title={isHR ? 'Régulariser le pointage' : 'Voir la journée'} aria-label={isHR ? 'Régulariser le pointage' : 'Voir la journée'} onClick={() => setRegularize(a.attendanceId)}>
                          <span className="hidden 2xl:inline">{isHR ? 'Régulariser' : 'Voir la journée'}</span>
                        </Button>
                      )}
                      {isHR && (a.status === 'OUVERTE' || a.status === 'EN_COURS') && (
                        <Button variant="outline" size="sm" leftIcon={<ShieldAlert />} onClick={() => setResolving(a)}>Traiter</Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {q.data && q.data.total > 0 && (
            <Pagination page={page} pageSize={pageSize} total={q.data.total} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />
          )}
        </TableContainer>
      </Card>
      <ResolveDialog anomaly={resolving} onOpenChange={(o) => !o && setResolving(null)} />
      <AttendanceDetailDialog id={regularize} open={!!regularize} startInCorrect={isHR} onOpenChange={(o) => !o && setRegularize(null)} />
      {isHR && <DetectionDialog open={detectOpen} onOpenChange={setDetectOpen} />}
    </div>
  );
}
