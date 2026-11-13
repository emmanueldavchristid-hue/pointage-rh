import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowRight, Building2, CalendarClock, CalendarPlus, CheckCircle2, Clock, History, Layers, Lock, MoreHorizontal, Pencil,
  Plus, Power, Search, Star, User, UserRound, Users,
} from 'lucide-react';
import {
  Badge, Button, Card, CardContent, CardHeader, ConfirmDialog, DatePicker, Dialog, DialogBody, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuTrigger, EmptyState, FormField, Input, PageHeader, Select, Skeleton, Table, TableBody, TableCell,
  TableContainer, TableEmptyRow, TableHead, TableHeader, TableRow, TableSkeleton, Tabs, TabsContent, TabsList, TabsTrigger, Textarea,
} from '@/components/ui';
import { Callout, DepartmentSelect, DetailRow, EmployeePicker, ListSkeleton, LoadError, WeekdayChips } from '@/features/admin/shared';
import {
  useAssignments, useCloseAssignment, useCreateAssignment, useCreateSchedule, useCreateScheduleVersion, useResolveSchedule,
  useSchedules, useUpdateSchedule, type Schedule, type ScheduleAssignment, type ScheduleVersion,
} from '@/features/schedules/api';
import {
  applyServerErrors, ScheduleVersionFields, toVersionInput, useVersionForm, versionDefaults, VersionSummary,
} from '@/features/schedules/components/ScheduleVersionForm';
import { useAuth } from '@/features/auth/AuthProvider';
import { isApiError } from '@/lib/api';
import { SCHEDULE_SOURCE } from '@/lib/labels';
import { addDaysISO, formatDate, formatDateLong, formatDuration, formatWorkDays, todayISO } from '@/lib/format';
import { cn } from '@/lib/utils';

export default function AdminSchedulesPage() {
  const q = useSchedules();
  const [tab, setTab] = React.useState('models');
  const [createOpen, setCreateOpen] = React.useState(false);
  const [detailId, setDetailId] = React.useState<number | null>(null);
  const detail = q.data?.find((s) => s.id === detailId) ?? null;

  return (
    <div>
      <PageHeader
        title="Horaires de travail"
        description="Modèles d'horaires versionnés, affectations aux employés et départements."
        actions={<Button leftIcon={<Plus />} onClick={() => setCreateOpen(true)}>Nouvel horaire</Button>}
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList variant="underline">
          <TabsTrigger value="models"><Layers />Modèles</TabsTrigger>
          <TabsTrigger value="assignments"><Users />Affectations</TabsTrigger>
          <TabsTrigger value="resolve"><Search />Quel horaire s'applique ?</TabsTrigger>
        </TabsList>

        <TabsContent value="models" className="mt-6">
          {q.isPending ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-52 rounded-xl" />)}</div>
          ) : q.isError ? (
            <Card><LoadError error={q.error} onRetry={q.refetch} /></Card>
          ) : q.data.length === 0 ? (
            <Card>
              <EmptyState icon={CalendarClock} title="Aucun horaire" description="Créez un premier modèle d'horaire pour vos équipes."
                action={<Button leftIcon={<Plus />} onClick={() => setCreateOpen(true)}>Nouvel horaire</Button>} />
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {q.data.map((s) => <ScheduleCard key={s.id} s={s} onOpen={() => setDetailId(s.id)} />)}
            </div>
          )}
        </TabsContent>
        <TabsContent value="assignments" className="mt-6"><AssignmentsPanel schedules={q.data ?? []} /></TabsContent>
        <TabsContent value="resolve" className="mt-6"><ResolvePanel /></TabsContent>
      </Tabs>

      <CreateScheduleDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={(id) => id && setDetailId(id)} />
      <ScheduleDetailDialog schedule={detail} onOpenChange={(o) => !o && setDetailId(null)} />
    </div>
  );
}

const upcomingOf = (s: Schedule): ScheduleVersion | null => {
  if (s.upcomingVersion) return s.upcomingVersion;
  const today = todayISO();
  return [...s.versions].filter((v) => v.effectiveFrom > today).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))[0] ?? null;
};

function ScheduleCard({ s, onOpen }: { s: Schedule; onOpen: () => void }) {
  const v = s.currentVersion;
  const up = upcomingOf(s);
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn('group flex flex-col rounded-xl border bg-white p-5 text-left shadow-card transition-colors hover:border-brand-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30', s.active ? 'border-slate-200' : 'border-dashed border-slate-300 opacity-75')}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-semibold text-ink">{s.name}</h3>
          {s.description && <p className="mt-0.5 line-clamp-2 text-[13px] text-muted">{s.description}</p>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {s.isDefault && <Badge variant="brand"><Star className="h-3 w-3" />Par défaut</Badge>}
          {!s.active && <Badge variant="muted">Inactif</Badge>}
        </div>
      </div>
      <div className="mt-4 flex-1 space-y-2 rounded-lg bg-slate-50 p-3">
        {v ? (
          <>
            <VersionSummary v={v} compact />
            <p className="text-xs text-muted">{formatWorkDays(v.workDays)} · retard toléré {v.lateToleranceMin} min · en vigueur depuis le {formatDate(v.effectiveFrom)}</p>
          </>
        ) : (
          <p className="text-sm text-muted">Aucune version en vigueur à ce jour.</p>
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex items-center gap-1 text-muted"><Users className="h-3.5 w-3.5" />{s.assignmentsCount} affectation{s.assignmentsCount > 1 ? 's' : ''}</span>
        <span className="inline-flex items-center gap-1 text-muted"><History className="h-3.5 w-3.5" />{s.versions.length} version{s.versions.length > 1 ? 's' : ''}</span>
        {up && <Badge variant="warning" className="ml-auto"><CalendarPlus className="h-3 w-3" />Nouvelle version le {formatDate(up.effectiveFrom)}</Badge>}
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Création
// ---------------------------------------------------------------------------

const metaSchema = z.object({
  name: z.string().trim().min(2, 'Nom trop court (2 caractères minimum).').max(80, 'Nom trop long.'),
  description: z.string().max(240, 'Description trop longue.'),
});

function CreateScheduleDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (id?: number) => void }) {
  const create = useCreateSchedule();
  const { hasRole } = useAuth();
  const meta = useForm<z.infer<typeof metaSchema>>({ resolver: zodResolver(metaSchema), defaultValues: { name: '', description: '' } });
  const form = useVersionForm(versionDefaults(null, todayISO()));
  React.useEffect(() => {
    if (open) { meta.reset({ name: '', description: '' }); form.reset(versionDefaults(null, todayISO())); }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit() {
    const okMeta = await meta.trigger();
    const okVersion = await form.trigger();
    if (!okMeta || !okVersion) return;
    const m = meta.getValues();
    try {
      const res = await create.mutateAsync({ name: m.name.trim(), description: m.description.trim() || undefined, version: toVersionInput(form.getValues()) });
      onOpenChange(false);
      onCreated(res?.id);
    } catch (e) {
      if (isApiError(e) && e.status === 422) {
        Object.entries(e.fieldErrors).forEach(([k, msg]) => { if (k === 'name' || k === 'description') meta.setError(k, { message: msg }); });
        applyServerErrors(e, form, 'version.');
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>Nouvel horaire</DialogTitle>
          <DialogDescription>Un horaire est un modèle nommé dont les règles sont définies par versions datées.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="mb-6 grid gap-4 border-b border-slate-100 pb-6 sm:grid-cols-2">
            <FormField label="Nom de l'horaire" htmlFor="s-name" error={meta.formState.errors.name} required>
              <Input id="s-name" placeholder="Ex. Horaire administratif" {...meta.register('name')} aria-invalid={!!meta.formState.errors.name} />
            </FormField>
            <FormField label="Description" htmlFor="s-desc" error={meta.formState.errors.description} hint="Facultatif">
              <Input id="s-desc" placeholder="Ex. Bureaux du siège" {...meta.register('description')} />
            </FormField>
          </div>
          <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-muted">Première version</p>
          <ScheduleVersionFields form={form} idPrefix="new" minEffectiveFrom={hasRole('SUPER_ADMIN') ? undefined : todayISO()} />
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={submit} loading={create.isPending}>Créer l'horaire</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Détail : historique des versions
// ---------------------------------------------------------------------------

function ScheduleDetailDialog({ schedule: s, onOpenChange }: { schedule: Schedule | null; onOpenChange: (o: boolean) => void }) {
  const update = useUpdateSchedule();
  const [versionOpen, setVersionOpen] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);
  const [confirm, setConfirm] = React.useState<'default' | 'toggle' | null>(null);
  const today = todayISO();
  const versions = s ? [...s.versions].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom)) : [];

  return (
    <>
      <Dialog open={!!s} onOpenChange={onOpenChange}>
        <DialogContent size="xl">
          {s && (
            <>
              <DialogHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <DialogTitle>{s.name}</DialogTitle>
                  {s.isDefault && <Badge variant="brand"><Star className="h-3 w-3" />Par défaut</Badge>}
                  {!s.active && <Badge variant="muted">Inactif</Badge>}
                </div>
                <DialogDescription>{s.description || 'Aucune description.'}</DialogDescription>
              </DialogHeader>
              <DialogBody className="space-y-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Button leftIcon={<CalendarPlus />} onClick={() => setVersionOpen(true)}>Nouvelle version</Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" leftIcon={<MoreHorizontal />}>Actions</Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem icon={<Pencil />} onSelect={() => setEditOpen(true)}>Renommer / décrire</DropdownMenuItem>
                      {!s.isDefault && <DropdownMenuItem icon={<Star />} onSelect={() => setConfirm('default')}>Définir comme horaire par défaut</DropdownMenuItem>}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem icon={<Power />} destructive={s.active} disabled={s.isDefault && s.active} onSelect={() => setConfirm('toggle')}>
                        {s.active ? "Désactiver l'horaire" : "Réactiver l'horaire"}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <span className="ml-auto text-sm text-muted">{s.assignmentsCount} affectation{s.assignmentsCount > 1 ? 's' : ''}</span>
                </div>

                <Callout icon={Lock} title="Les versions ne sont jamais modifiées rétroactivement">
                  Pour changer les règles, créez une nouvelle version avec une date d'effet : les journées déjà passées restent calculées
                  avec la version en vigueur à leur date, ce qui garantit des historiques et des rapports fiables.
                </Callout>

                <ol className="relative space-y-4 border-l border-slate-200 pl-6" aria-label="Historique des versions">
                  {versions.map((v) => {
                    const isCurrent = s.currentVersion?.id === v.id;
                    const isFuture = v.effectiveFrom > today;
                    return (
                      <li key={v.id} className="relative">
                        <span className={cn('absolute -left-[31px] top-4 h-3.5 w-3.5 rounded-full border-2 border-white ring-1',
                          isCurrent ? 'bg-success ring-success' : isFuture ? 'bg-warning ring-warning' : 'bg-slate-300 ring-slate-300')} aria-hidden />
                        <div className={cn('rounded-xl border p-4', isCurrent ? 'border-success-border bg-success-soft/40' : isFuture ? 'border-warning-border bg-warning-soft/40' : 'border-slate-200 bg-white')}>
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-ink">À partir du {formatDateLong(v.effectiveFrom)}</span>
                            {isCurrent && <Badge variant="success" dot>En vigueur</Badge>}
                            {isFuture && <Badge variant="warning" dot>Programmée</Badge>}
                            {!isCurrent && !isFuture && <Badge variant="muted">Archivée</Badge>}
                          </div>
                          <VersionSummary v={v} />
                          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted">
                            <WeekdayChipsReadonly days={v.workDays} />
                            <span>Retard toléré : {v.lateToleranceMin} min</span>
                            <span>Départ anticipé toléré : {v.earlyLeaveToleranceMin} min</span>
                            <span>Seuil HS : {v.overtimeThresholdMin} min</span>
                            <span>Arrivée possible {v.arrivalWindowBeforeMin} min avant</span>
                            <span>{v.breakTracking ? `Pauses pointées (max ${v.maxBreaks})` : 'Pauses non pointées'}</span>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </DialogBody>
            </>
          )}
        </DialogContent>
      </Dialog>

      {s && <NewVersionDialog schedule={s} open={versionOpen} onOpenChange={setVersionOpen} />}
      {s && <EditMetaDialog schedule={s} open={editOpen} onOpenChange={setEditOpen} />}
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        tone={confirm === 'toggle' && s?.active ? 'danger' : 'default'}
        title={confirm === 'default' ? 'Définir comme horaire par défaut ?' : s?.active ? "Désactiver l'horaire ?" : "Réactiver l'horaire ?"}
        description={confirm === 'default'
          ? "Cet horaire s'appliquera à tout employé sans affectation individuelle ni affectation de département."
          : s?.active ? "Il ne pourra plus être choisi pour de nouvelles affectations. Les calculs passés ne sont pas modifiés." : 'Il pourra de nouveau être affecté.'}
        confirmLabel={confirm === 'default' ? 'Définir par défaut' : s?.active ? 'Désactiver' : 'Réactiver'}
        onConfirm={async () => { if (s) await update.mutateAsync(confirm === 'default' ? { id: s.id, isDefault: true } : { id: s.id, active: !s.active }); }}
      />
    </>
  );
}

function WeekdayChipsReadonly({ days }: { days: number[] }) {
  const labels = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  return (
    <span className="inline-flex gap-1" aria-label={`Jours travaillés : ${formatWorkDays(days)}`}>
      {labels.map((l, i) => (
        <span key={i} className={cn('flex h-5 w-5 items-center justify-center rounded text-[10px] font-semibold', days.includes(i + 1) ? 'bg-brand text-white' : 'bg-slate-100 text-slate-400')}>{l}</span>
      ))}
    </span>
  );
}

function NewVersionDialog({ schedule, open, onOpenChange }: { schedule: Schedule; open: boolean; onOpenChange: (o: boolean) => void }) {
  const create = useCreateScheduleVersion();
  const { hasRole } = useAuth();
  const latest = [...schedule.versions].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0] ?? schedule.currentVersion;
  const defaultFrom = addDaysISO(todayISO(), 1);
  const form = useVersionForm(versionDefaults(latest, defaultFrom));
  React.useEffect(() => {
    if (open) form.reset(versionDefaults(latest, defaultFrom));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const isSuper = hasRole('SUPER_ADMIN');
  const from = form.watch('effectiveFrom');

  async function onSubmit() {
    const ok = await form.trigger();
    if (!ok) return;
    try {
      await create.mutateAsync({ scheduleId: schedule.id, ...toVersionInput(form.getValues()) });
      onOpenChange(false);
    } catch (e) {
      applyServerErrors(e, form);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>Nouvelle version — {schedule.name}</DialogTitle>
          <DialogDescription>Pré-remplie avec la dernière version. Elle prendra effet à la date choisie, sans modifier le passé.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          {from && from < todayISO() && (
            <Callout tone="warning" className="mb-5" title="Date d'effet dans le passé">
              Réservé au super administrateur : les journées depuis le {formatDate(from)} pourront être recalculées selon cette version.
            </Callout>
          )}
          <ScheduleVersionFields form={form} idPrefix="nv" minEffectiveFrom={isSuper ? undefined : todayISO()} />
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={onSubmit} loading={create.isPending}>Enregistrer la version</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditMetaDialog({ schedule, open, onOpenChange }: { schedule: Schedule; open: boolean; onOpenChange: (o: boolean) => void }) {
  const update = useUpdateSchedule();
  const { register, handleSubmit, reset, setError, formState: { errors } } = useForm<z.infer<typeof metaSchema>>({
    resolver: zodResolver(metaSchema), defaultValues: { name: schedule.name, description: schedule.description ?? '' },
  });
  React.useEffect(() => { if (open) reset({ name: schedule.name, description: schedule.description ?? '' }); }, [open, schedule, reset]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <form noValidate onSubmit={handleSubmit(async (v) => {
          try {
            await update.mutateAsync({ id: schedule.id, name: v.name.trim(), description: v.description.trim() || null });
            onOpenChange(false);
          } catch (e) {
            if (isApiError(e) && e.status === 422) Object.entries(e.fieldErrors).forEach(([k, m]) => setError(k as 'name', { message: m }));
          }
        })}>
          <DialogHeader><DialogTitle>Modifier l'horaire</DialogTitle></DialogHeader>
          <DialogBody className="space-y-4">
            <FormField label="Nom" htmlFor="em-name" error={errors.name} required><Input id="em-name" {...register('name')} /></FormField>
            <FormField label="Description" htmlFor="em-desc" error={errors.description}><Textarea id="em-desc" rows={3} {...register('description')} /></FormField>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
            <Button type="submit" loading={update.isPending}>Enregistrer</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Affectations
// ---------------------------------------------------------------------------

function assignmentState(a: ScheduleAssignment, today: string): { label: string; variant: 'success' | 'warning' | 'muted' } {
  if (a.effectiveFrom > today) return { label: 'À venir', variant: 'warning' };
  if (a.effectiveTo && a.effectiveTo < today) return { label: 'Terminée', variant: 'muted' };
  return { label: 'En cours', variant: 'success' };
}

function AssignmentsPanel({ schedules }: { schedules: Schedule[] }) {
  const [departmentId, setDepartmentId] = React.useState('');
  const [scheduleFilter, setScheduleFilter] = React.useState('');
  const [showEnded, setShowEnded] = React.useState(false);
  const q = useAssignments(departmentId ? { departmentId } : {});
  const close = useCloseAssignment();
  const [toClose, setToClose] = React.useState<ScheduleAssignment | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const today = todayISO();
  const name = (id: number) => schedules.find((s) => s.id === id)?.name;
  const rows = (q.data ?? [])
    .filter((a) => !scheduleFilter || String(a.scheduleId) === scheduleFilter)
    .filter((a) => showEnded || !(a.effectiveTo && a.effectiveTo < today))
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  const defaultSchedule = schedules.find((s) => s.isDefault);

  return (
    <div className="space-y-5">
      <Callout title="Quel horaire s'applique à un employé ?">
        <p>
          Priorité décroissante : <strong>1. affectation individuelle</strong> de l'employé, sinon <strong>2. affectation de son département</strong>,
          sinon <strong>3. horaire par défaut</strong>{defaultSchedule ? ` (« ${defaultSchedule.name} »)` : ''}. Seules les affectations en cours à la date concernée comptent.
        </p>
      </Callout>
      <TableContainer>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center">
          <div className="flex flex-1 flex-wrap items-center gap-2 [&>*]:min-w-[180px] [&>*]:flex-1 sm:[&>*]:flex-none">
            <Select aria-label="Horaire" value={scheduleFilter} onValueChange={setScheduleFilter} allLabel="Tous les horaires" options={schedules.map((s) => ({ value: String(s.id), label: s.name }))} />
            <DepartmentSelect value={departmentId} onChange={setDepartmentId} />
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300 accent-brand" checked={showEnded} onChange={(e) => setShowEnded(e.target.checked)} />
              Afficher les affectations terminées
            </label>
          </div>
          <Button leftIcon={<Plus />} onClick={() => setCreateOpen(true)}>Nouvelle affectation</Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cible</TableHead>
              <TableHead>Horaire</TableHead>
              <TableHead>Période</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead align="right"><span className="sr-only">Actions</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.isPending ? (
              <TableEmptyRow colSpan={5}><div className="p-4"><TableSkeleton rows={4} cols={4} /></div></TableEmptyRow>
            ) : q.isError ? (
              <TableEmptyRow colSpan={5}><LoadError error={q.error} onRetry={q.refetch} compact /></TableEmptyRow>
            ) : rows.length === 0 ? (
              <TableEmptyRow colSpan={5}>
                <EmptyState compact icon={Users} title="Aucune affectation" description="Sans affectation, les employés suivent l'horaire par défaut." />
              </TableEmptyRow>
            ) : rows.map((a) => {
              const st = assignmentState(a, today);
              const isEmp = (a.target ?? (a.employeeId ? 'EMPLOYE' : 'DEPARTEMENT')) === 'EMPLOYE';
              const closable = !a.effectiveTo || a.effectiveTo >= today;
              return (
                <TableRow key={a.id}>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <span className={cn('flex h-8 w-8 items-center justify-center rounded-lg', isEmp ? 'bg-brand-50 text-brand' : 'bg-slate-100 text-slate-600')}>
                        {isEmp ? <UserRound className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
                      </span>
                      <div>
                        <p className="font-medium text-ink">{isEmp ? a.employeeName ?? `Employé n° ${a.employeeId}` : a.departmentName ?? `Département n° ${a.departmentId}`}</p>
                        <p className="text-xs text-muted">{isEmp ? 'Individuelle — priorité 1' : 'Département — priorité 2'}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium text-ink">{a.scheduleName ?? name(a.scheduleId) ?? '—'}</TableCell>
                  <TableCell className="tabular">
                    Du {formatDate(a.effectiveFrom)}<span className="text-muted"> {a.effectiveTo ? `au ${formatDate(a.effectiveTo)}` : '· sans date de fin'}</span>
                  </TableCell>
                  <TableCell><Badge variant={st.variant} dot>{st.label}</Badge></TableCell>
                  <TableCell align="right">
                    {closable && <Button variant="ghost" size="sm" onClick={() => setToClose(a)}>Clôturer</Button>}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <AssignmentDialog open={createOpen} onOpenChange={setCreateOpen} schedules={schedules} />
      <ConfirmDialog
        open={!!toClose}
        onOpenChange={(o) => !o && setToClose(null)}
        title="Clôturer cette affectation ?"
        description="L'affectation prendra fin la veille d'aujourd'hui. La cible suivra ensuite l'horaire de priorité inférieure (département ou défaut)."
        confirmLabel="Clôturer"
        onConfirm={() => close.mutateAsync(toClose!.id)}
      />
    </div>
  );
}

function AssignmentDialog({ open, onOpenChange, schedules }: { open: boolean; onOpenChange: (o: boolean) => void; schedules: Schedule[] }) {
  const create = useCreateAssignment();
  const [scheduleId, setScheduleId] = React.useState('');
  const [mode, setMode] = React.useState<'EMPLOYE' | 'DEPARTEMENT'>('EMPLOYE');
  const [employeeIds, setEmployeeIds] = React.useState<number[]>([]);
  const [departmentId, setDepartmentId] = React.useState('');
  const [from, setFrom] = React.useState(todayISO());
  const [to, setTo] = React.useState('');
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  React.useEffect(() => {
    if (open) { setScheduleId(''); setMode('EMPLOYE'); setEmployeeIds([]); setDepartmentId(''); setFrom(todayISO()); setTo(''); setErrors({}); }
  }, [open]);

  async function submit() {
    const e: Record<string, string> = {};
    if (!scheduleId) e.scheduleId = 'Choisissez un horaire.';
    if (mode === 'EMPLOYE' && employeeIds.length === 0) e.employeeIds = 'Sélectionnez au moins un employé.';
    if (mode === 'DEPARTEMENT' && !departmentId) e.departmentId = 'Choisissez un département.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from)) e.effectiveFrom = "Choisissez la date d'effet.";
    if (to && to < from) e.effectiveTo = 'La date de fin doit suivre la date de début.';
    setErrors(e);
    if (Object.keys(e).length) return;
    try {
      await create.mutateAsync({
        scheduleId: Number(scheduleId),
        ...(mode === 'EMPLOYE' ? { employeeIds } : { departmentId: Number(departmentId) }),
        effectiveFrom: from,
        effectiveTo: to || undefined,
      });
      onOpenChange(false);
    } catch (err) {
      if (isApiError(err) && err.status === 422) setErrors(err.fieldErrors);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Nouvelle affectation</DialogTitle>
          <DialogDescription>Associez un horaire à des employés ou à un département entier.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <FormField label="Horaire" htmlFor="as-s" error={errors.scheduleId} required>
            <Select id="as-s" value={scheduleId} onValueChange={setScheduleId} placeholder="Choisir un horaire" aria-invalid={!!errors.scheduleId}
              options={schedules.filter((s) => s.active).map((s) => ({ value: String(s.id), label: s.name }))} />
          </FormField>
          <div>
            <p className="mb-1.5 text-sm font-medium text-slate-700">Cible</p>
            <div className="grid grid-cols-2 gap-2" role="radiogroup">
              {([['EMPLOYE', 'Employés', User], ['DEPARTEMENT', 'Département', Building2]] as const).map(([m, label, Icon]) => (
                <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)}
                  className={cn('flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors', mode === m ? 'border-brand bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50')}>
                  <Icon className="h-4 w-4" />{label}
                </button>
              ))}
            </div>
          </div>
          {mode === 'EMPLOYE' ? (
            <FormField label="Employés" htmlFor="as-e" error={errors.employeeIds} required hint="Une affectation individuelle prime sur celle du département.">
              <EmployeePicker id="as-e" multiple value={employeeIds} onChange={(ids) => setEmployeeIds(ids)} placeholder="Sélectionner des employés" invalid={!!errors.employeeIds} />
            </FormField>
          ) : (
            <FormField label="Département" htmlFor="as-d" error={errors.departmentId} required hint="S'applique aux employés du département sans affectation individuelle.">
              <DepartmentSelect id="as-d" value={departmentId} onChange={setDepartmentId} allLabel={null} placeholder="Choisir un département" />
            </FormField>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Date d'effet" htmlFor="as-from" error={errors.effectiveFrom} required>
              <DatePicker id="as-from" value={from} onChange={setFrom} />
            </FormField>
            <FormField label="Date de fin" htmlFor="as-to" error={errors.effectiveTo} hint="Facultatif">
              <DatePicker id="as-to" value={to} min={from} onChange={setTo} />
            </FormField>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button onClick={submit} loading={create.isPending}>Affecter</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Résolution
// ---------------------------------------------------------------------------

function ResolvePanel() {
  const [employee, setEmployee] = React.useState<number[]>([]);
  const [date, setDate] = React.useState(todayISO());
  const q = useResolveSchedule(employee[0] ?? null, date);
  const steps = [
    { key: 'EMPLOYE', label: 'Affectation individuelle', icon: UserRound },
    { key: 'DEPARTEMENT', label: 'Affectation du département', icon: Building2 },
    { key: 'DEFAUT', label: 'Horaire par défaut', icon: Star },
  ];
  return (
    <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
      <Card>
        <CardHeader title="Rechercher" description="Choisissez un employé et une date." />
        <CardContent className="space-y-4">
          <FormField label="Employé" htmlFor="rs-e"><EmployeePicker id="rs-e" value={employee} onChange={(ids) => setEmployee(ids)} /></FormField>
          <FormField label="Date" htmlFor="rs-d"><DatePicker id="rs-d" value={date} onChange={setDate} /></FormField>
        </CardContent>
      </Card>
      <Card>
        {!employee.length ? (
          <EmptyState icon={Search} title="Quel horaire s'applique ?" description="Le résultat indique l'horaire et la version retenus, ainsi que la règle de priorité qui s'applique." />
        ) : q.isPending ? (
          <CardContent className="space-y-3 pt-6"><ListSkeleton rows={3} /></CardContent>
        ) : q.isError ? (
          <LoadError error={q.error} onRetry={q.refetch} />
        ) : (
          <CardContent className="space-y-6 pt-6">
            <div className="flex items-start gap-4">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-success-soft text-success"><CheckCircle2 className="h-5 w-5" /></span>
              <div>
                <p className="text-sm text-muted">Le {formatDateLong(date)}</p>
                <p className="text-lg font-semibold text-ink">{q.data.schedule?.name ?? 'Aucun horaire'}</p>
                <Badge variant="brand" className="mt-1">{SCHEDULE_SOURCE[q.data.source] ?? q.data.source}</Badge>
              </div>
            </div>
            <ol className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {steps.map((st, i) => {
                const idx = steps.findIndex((x) => x.key === q.data.source);
                const state = i < idx ? 'skipped' : i === idx ? 'hit' : 'unused';
                return (
                  <React.Fragment key={st.key}>
                    <li className={cn('flex flex-1 items-center gap-2 rounded-lg border px-3 py-2 text-sm',
                      state === 'hit' ? 'border-success-border bg-success-soft font-medium text-green-800' : state === 'skipped' ? 'border-slate-200 text-slate-400 line-through' : 'border-dashed border-slate-200 text-slate-400')}>
                      <st.icon className="h-4 w-4" />{i + 1}. {st.label}
                    </li>
                    {i < steps.length - 1 && <ArrowRight className="hidden h-4 w-4 shrink-0 text-slate-300 sm:block" />}
                  </React.Fragment>
                );
              })}
            </ol>
            {q.data.version ? (
              <div className="rounded-xl border border-slate-200 p-4">
                <p className="mb-3 text-sm font-semibold text-ink">Version en vigueur depuis le {formatDate(q.data.version.effectiveFrom)}</p>
                <VersionSummary v={q.data.version} />
                <dl className="mt-3 divide-y divide-slate-100">
                  <DetailRow label="Jours travaillés"><WeekdayChips value={q.data.version.workDays} disabled /></DetailRow>
                  <DetailRow label="Durée théorique">{formatDuration(q.data.version.dailyMinutes)}</DetailRow>
                  <DetailRow label="Tolérance de retard">{q.data.version.lateToleranceMin} min</DetailRow>
                  <DetailRow label="Seuil heures sup.">{q.data.version.overtimeThresholdMin} min</DetailRow>
                  <DetailRow label="Pauses">{q.data.version.breakTracking ? `Pointées (max ${q.data.version.maxBreaks})` : 'Non pointées'}</DetailRow>
                </dl>
              </div>
            ) : (
              <Callout tone="warning" icon={Clock}>Aucune version n'est en vigueur à cette date pour cet horaire.</Callout>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
