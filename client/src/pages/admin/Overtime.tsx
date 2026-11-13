import * as React from 'react';
import { CheckCircle2, Clock, Hourglass, Scale, Timer, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  Avatar, Badge, Button, DateRangePicker, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle, EmptyState, FilterBar, FormField, Label, PageHeader, Pagination, Select, StatCard, Table, TableBody, TableCell,
  TableContainer, TableEmptyRow, TableHead, TableHeader, TableRow, TableSkeleton, Textarea,
} from '@/components/ui';
import { Callout, DepartmentSelect, DetailRow, LoadError, NumberInput } from '@/features/admin/shared';
import { OVERTIME_STATUS, useDecideOvertime, useOvertime, type OvertimeRecord } from '@/features/overtime/api';
import { useSystemSettings, type OvertimeRate } from '@/features/settings/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { isApiError } from '@/lib/api';
import { formatDate, formatDateLong, formatDuration, formatNumber, formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';

export default function AdminOvertimePage() {
  const { hasRole } = useAuth();
  const canReadSettings = hasRole('SUPER_ADMIN', 'HR_ADMIN');
  const settings = useSystemSettings(canReadSettings);
  const rates = settings.data?.overtime.rates ?? [];
  const [status, setStatus] = React.useState('EN_ATTENTE');
  const [range, setRange] = React.useState({ from: '', to: '' });
  const [departmentId, setDepartmentId] = React.useState('');
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);
  const [selected, setSelected] = React.useState<OvertimeRecord | null>(null);
  React.useEffect(() => setPage(1), [status, range.from, range.to, departmentId, pageSize]);

  const base = { from: range.from || undefined, to: range.to || undefined, departmentId: departmentId || undefined };
  const q = useOvertime({ ...base, status: status || undefined, page, pageSize });
  // Totaux par statut sur la période/département filtrés.
  const all = useOvertime({ ...base, page: 1, pageSize: 500 });
  const totals = React.useMemo(() => {
    const t = { pendingCount: 0, pendingMin: 0, validatedMin: 0, refusedCount: 0, potentialMin: 0 };
    (all.data?.items ?? []).forEach((r) => {
      t.potentialMin += r.potentialMinutes || 0;
      if (r.status === 'EN_ATTENTE') { t.pendingCount++; t.pendingMin += r.potentialMinutes || 0; }
      if (r.status === 'VALIDE') t.validatedMin += r.validatedMinutes ?? 0;
      if (r.status === 'REFUSE') t.refusedCount++;
    });
    return t;
  }, [all.data]);
  const partial = !!all.data && all.data.total > all.data.items.length;
  const canReset = status !== 'EN_ATTENTE' || !!range.from || !!range.to || !!departmentId;

  return (
    <div>
      <PageHeader title="Heures supplémentaires" description="Validation des heures supplémentaires potentielles calculées à partir des pointages." />

      <Callout icon={Scale} tone="warning" className="mb-6" title="Présence n'est pas travail effectif">
        Les minutes affichées sont <strong>potentielles</strong> : elles mesurent une présence au-delà de l'horaire, pas un travail
        commandé. Aucune heure supplémentaire n'est validée automatiquement ; seule une décision explicite la rend payable.
      </Callout>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="À valider" icon={Hourglass} tone="warning" loading={all.isPending} value={formatNumber(totals.pendingCount)} hint={formatDuration(totals.pendingMin)} onClick={() => setStatus('EN_ATTENTE')} />
        <StatCard label="Potentielles (période)" icon={Clock} tone="neutral" loading={all.isPending} value={formatDuration(totals.potentialMin)} hint={partial ? `Sur les ${all.data?.items.length} premières lignes` : 'Toutes demandes confondues'} />
        <StatCard label="Validées" icon={CheckCircle2} tone="success" loading={all.isPending} value={formatDuration(totals.validatedMin)} onClick={() => setStatus('VALIDE')} />
        <StatCard label="Refusées" icon={XCircle} tone="danger" loading={all.isPending} value={formatNumber(totals.refusedCount)} onClick={() => setStatus('REFUSE')} />
      </div>

      <TableContainer>
        <FilterBar onReset={() => { setStatus('EN_ATTENTE'); setRange({ from: '', to: '' }); setDepartmentId(''); }} canReset={canReset}>
          <Select aria-label="Statut" value={status} onValueChange={setStatus} allLabel="Tous les statuts"
            options={Object.entries(OVERTIME_STATUS).map(([value, d]) => ({ value, label: d.label }))} />
          <DateRangePicker from={range.from} to={range.to} onChange={setRange} />
          <DepartmentSelect value={departmentId} onChange={setDepartmentId} />
        </FilterBar>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employé</TableHead>
              <TableHead>Journée</TableHead>
              <TableHead>Présence</TableHead>
              <TableHead align="right">Travaillé / prévu</TableHead>
              <TableHead align="right">Potentielles</TableHead>
              <TableHead align="right">Validées</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead align="right"><span className="sr-only">Action</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.isPending ? (
              <TableEmptyRow colSpan={8}><div className="p-4"><TableSkeleton rows={5} cols={7} /></div></TableEmptyRow>
            ) : q.isError ? (
              <TableEmptyRow colSpan={8}><LoadError error={q.error} onRetry={q.refetch} compact /></TableEmptyRow>
            ) : q.data.items.length === 0 ? (
              <TableEmptyRow colSpan={8}>
                <EmptyState compact icon={Timer} title={status === 'EN_ATTENTE' ? 'Aucune heure sup. à valider' : 'Aucun résultat'} description="Les heures sup. potentielles apparaissent après la clôture des journées." />
              </TableEmptyRow>
            ) : q.data.items.map((r) => {
              const st = OVERTIME_STATUS[r.status] ?? { label: r.status, variant: 'neutral' as const };
              const rate = rates.find((x) => x.code === r.rateCode);
              return (
                <TableRow key={r.id} clickable onClick={() => setSelected(r)}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar name={r.employee.fullName} src={r.employee.photoUrl ?? undefined} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink">{r.employee.fullName}</p>
                        <p className="truncate text-xs text-muted">{r.employee.departmentName ?? r.employee.matricule}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular">{formatDate(r.workDate)}</TableCell>
                  <TableCell className="whitespace-nowrap tabular">{formatTime(r.arrivalAt)} – {formatTime(r.departureAt)}</TableCell>
                  <TableCell align="right">{formatDuration(r.workedMinutes)} <span className="text-muted">/ {formatDuration(r.expectedMinutes)}</span></TableCell>
                  <TableCell align="right" className="font-medium text-ink">{formatDuration(r.potentialMinutes)}</TableCell>
                  <TableCell align="right">
                    {r.status === 'VALIDE' ? <span className="font-medium text-green-700">{formatDuration(r.validatedMinutes)}</span> : <span className="text-muted">—</span>}
                    {rate && <p className="text-[11px] text-muted">{rate.label} (+{formatNumber(rate.percent, 1)} %)</p>}
                    {!rate && r.rateCode && <p className="text-[11px] text-muted">{r.rateCode}</p>}
                  </TableCell>
                  <TableCell><Badge variant={st.variant} dot>{st.label === 'Validées' ? 'Validé' : st.label === 'Refusées' ? 'Refusé' : st.label}</Badge></TableCell>
                  <TableCell align="right">
                    <Button size="sm" variant={r.status === 'EN_ATTENTE' ? 'secondary' : 'ghost'} onClick={(e) => { e.stopPropagation(); setSelected(r); }}>
                      {r.status === 'EN_ATTENTE' ? 'Traiter' : 'Détail'}
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {q.data && q.data.total > 0 && <Pagination page={page} pageSize={pageSize} total={q.data.total} onPageChange={setPage} onPageSizeChange={setPageSize} />}
      </TableContainer>

      <DecideDialog record={selected} onOpenChange={(o) => !o && setSelected(null)} rates={rates} ratesKnown={canReadSettings && settings.isSuccess} />
    </div>
  );
}

function DecideDialog({ record: r, onOpenChange, rates, ratesKnown }: { record: OvertimeRecord | null; onOpenChange: (o: boolean) => void; rates: OvertimeRate[]; ratesKnown: boolean }) {
  const decide = useDecideOvertime();
  const [minutes, setMinutes] = React.useState<number>(0);
  const [rateCode, setRateCode] = React.useState('');
  const [comment, setComment] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<'VALIDE' | 'REFUSE' | null>(null);
  React.useEffect(() => {
    if (r) { setMinutes(r.validatedMinutes ?? r.potentialMinutes); setRateCode(r.rateCode ?? ''); setComment(r.comment ?? ''); setError(null); }
  }, [r]);
  const editable = r?.status === 'EN_ATTENTE';

  async function submit(status: 'VALIDE' | 'REFUSE') {
    if (!r) return;
    if (status === 'VALIDE') {
      if (!Number.isFinite(minutes) || minutes <= 0) return setError('Indiquez un nombre de minutes supérieur à 0.');
      if (minutes > r.potentialMinutes) return setError(`Maximum ${r.potentialMinutes} min (heures potentielles).`);
      if (rates.length > 0 && !rateCode) return setError('Choisissez un taux de majoration.');
    }
    if (status === 'REFUSE' && comment.trim().length < 3) return setError('Merci de motiver le refus dans le commentaire.');
    setError(null);
    setPending(status);
    try {
      await decide.mutateAsync({
        id: r.id, status,
        validatedMinutes: status === 'VALIDE' ? Math.round(minutes) : undefined,
        rateCode: status === 'VALIDE' && rateCode ? rateCode : undefined,
        comment: comment.trim() || undefined,
      });
      toast.success(status === 'VALIDE' ? `${formatDuration(minutes)} validées.` : 'Heures sup. refusées.');
      onOpenChange(false);
    } catch (e) {
      if (isApiError(e)) setError(e.message);
    } finally {
      setPending(null);
    }
  }

  return (
    <Dialog open={!!r} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        {r && (
          <>
            <DialogHeader>
              <DialogTitle>{editable ? 'Valider des heures sup.' : 'Détail des heures sup.'}</DialogTitle>
              <DialogDescription>{r.employee.fullName} · {formatDateLong(r.workDate)}</DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-5">
              <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200 px-4">
                <DetailRow label="Arrivée – départ">{formatTime(r.arrivalAt)} – {formatTime(r.departureAt)}</DetailRow>
                <DetailRow label="Temps travaillé">{formatDuration(r.workedMinutes)}</DetailRow>
                <DetailRow label="Durée prévue">{formatDuration(r.expectedMinutes)}</DetailRow>
                <DetailRow label="Heures sup. potentielles"><span className="text-brand-700">{formatDuration(r.potentialMinutes)}</span></DetailRow>
                {!editable && <DetailRow label="Décision">{OVERTIME_STATUS[r.status]?.label ?? r.status}{r.decidedAt ? ` le ${formatDate(r.decidedAt)}` : ''}</DetailRow>}
              </dl>

              {editable ? (
                <>
                  <FormField label="Minutes validées" htmlFor="ot-min" hint={`${formatDuration(minutes)} sur ${formatDuration(r.potentialMinutes)} potentielles — ajustez selon le travail réellement demandé.`}>
                    <div className="flex items-center gap-2">
                      <div className="w-40"><NumberInput id="ot-min" unit="min" min={1} max={r.potentialMinutes} value={Number.isFinite(minutes) ? minutes : ''} onChange={(e) => setMinutes(e.target.valueAsNumber)} /></div>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setMinutes(r.potentialMinutes)}>Tout</Button>
                    </div>
                  </FormField>
                  <FormField label="Taux de majoration" htmlFor="ot-rate">
                    {rates.length > 0 ? (
                      <Select id="ot-rate" value={rateCode} onValueChange={setRateCode} placeholder="Choisir un taux"
                        options={rates.map((x) => ({ value: x.code, label: `${x.label} (+${formatNumber(x.percent, 1)} %)` }))} />
                    ) : (
                      <p className={cn('rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-muted')}>
                        {ratesKnown ? 'Aucun taux paramétré (Paramètres › Heures sup.). La validation est enregistrée sans taux.' : 'Taux non accessibles pour votre rôle : la RH complétera le taux si nécessaire.'}
                      </p>
                    )}
                  </FormField>
                </>
              ) : null}
              <div className="space-y-1.5">
                <Label htmlFor="ot-comment">Commentaire</Label>
                <Textarea id="ot-comment" rows={3} value={comment} onChange={(e) => setComment(e.target.value)} disabled={!editable}
                  placeholder="Ex. inventaire de fin de mois demandé par le responsable." />
              </div>
              {error && <p className="text-sm font-medium text-danger" role="alert">{error}</p>}
            </DialogBody>
            <DialogFooter>
              {editable ? (
                <>
                  <Button variant="destructive" leftIcon={<XCircle />} loading={pending === 'REFUSE'} disabled={!!pending} onClick={() => submit('REFUSE')}>Refuser</Button>
                  <Button variant="success" leftIcon={<CheckCircle2 />} loading={pending === 'VALIDE'} disabled={!!pending} onClick={() => submit('VALIDE')}>Valider {Number.isFinite(minutes) && minutes > 0 ? formatDuration(minutes) : ''}</Button>
                </>
              ) : <Button variant="outline" onClick={() => onOpenChange(false)}>Fermer</Button>}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
