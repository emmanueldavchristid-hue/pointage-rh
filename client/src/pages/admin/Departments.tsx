import * as React from 'react';
import { Link } from 'react-router-dom';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Briefcase, Building2, MoreHorizontal, Pencil, Plus, Power, PowerOff, Users } from 'lucide-react';
import { toast } from 'sonner';
import {
  Avatar, Badge, Button, ConfirmDialog, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, EmptyState, FormField, Input, PageHeader,
  SearchInput, Select, Table, TableBody, TableCell, TableContainer, TableHead, TableHeader, TableRow, TableSkeleton, Tabs, TabsContent,
  TabsList, TabsTrigger, Textarea,
} from '@/components/ui';
import { isApiError } from '@/lib/api';
import {
  useDeactivateDepartment, useDepartments, useEmployeeOptions, usePositions, useReactivateDepartment, useSaveDepartment, useSavePosition,
  type Department, type Position,
} from '@/features/org/api';
import { QueryError } from '@/features/org/components/shared';

const depSchema = z.object({
  name: z.string().trim().min(2, 'Le nom doit contenir au moins 2 caractères.').max(120),
  code: z.string().trim().min(1, 'Le code est obligatoire.').max(20, '20 caractères maximum.'),
  description: z.string().max(500, '500 caractères maximum.'),
  managerEmployeeId: z.string(),
});
type DepValues = z.infer<typeof depSchema>;

function DepartmentDialog({ value, onOpenChange }: { value: Department | null | undefined; onOpenChange: (o: boolean) => void }) {
  const open = value !== undefined;
  const emps = useEmployeeOptions(open);
  const mut = useSaveDepartment();
  const { register, control, handleSubmit, reset, setError, formState: { errors } } = useForm<DepValues>({ resolver: zodResolver(depSchema) });
  React.useEffect(() => {
    if (open) reset({ name: value?.name ?? '', code: value?.code ?? '', description: value?.description ?? '', managerEmployeeId: value?.managerEmployeeId ? String(value.managerEmployeeId) : '' });
  }, [open, value, reset]);
  const options = (emps.data ?? []).filter((e) => e.status === 'ACTIVE').map((e) => ({ value: String(e.id), label: `${e.fullName}${e.departmentName ? ` · ${e.departmentName}` : ''}` }));

  async function onSubmit(v: DepValues) {
    try {
      await mut.mutateAsync({ id: value?.id, data: { name: v.name.trim(), code: v.code.trim().toUpperCase(), description: v.description.trim() || null, managerEmployeeId: v.managerEmployeeId ? Number(v.managerEmployeeId) : null } });
      toast.success(value ? 'Département mis à jour.' : 'Département créé.');
      onOpenChange(false);
    } catch (e) {
      if (isApiError(e) && e.status === 422) Object.entries(e.fieldErrors).forEach(([k, m]) => setError(k as keyof DepValues, { message: m }));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex min-h-0 flex-col">
          <DialogHeader>
            <DialogTitle>{value ? 'Modifier le département' : 'Nouveau département'}</DialogTitle>
            <DialogDescription>Le responsable désigné valide les demandes de son équipe et consulte ses présences.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
              <FormField label="Nom" htmlFor="dep-name" error={errors.name} required><Input id="dep-name" {...register('name')} aria-invalid={!!errors.name} /></FormField>
              <FormField label="Code" htmlFor="dep-code" error={errors.code} required><Input id="dep-code" className="uppercase" {...register('code')} aria-invalid={!!errors.code} /></FormField>
            </div>
            <FormField label="Responsable" htmlFor="dep-mgr" error={errors.managerEmployeeId}>
              <Controller control={control} name="managerEmployeeId" render={({ field }) => (
                <Select id="dep-mgr" value={field.value} onValueChange={field.onChange} allLabel="Aucun responsable" options={options} />
              )} />
            </FormField>
            <FormField label="Description" htmlFor="dep-desc" error={errors.description}><Textarea id="dep-desc" rows={3} {...register('description')} /></FormField>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mut.isPending}>Annuler</Button>
            <Button type="submit" loading={mut.isPending}>{value ? 'Enregistrer' : 'Créer'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const posSchema = z.object({ title: z.string().trim().min(2, 'L’intitulé doit contenir au moins 2 caractères.').max(120), departmentId: z.string() });
type PosValues = z.infer<typeof posSchema>;

function PositionDialog({ value, onOpenChange }: { value: Position | null | undefined; onOpenChange: (o: boolean) => void }) {
  const open = value !== undefined;
  const deps = useDepartments();
  const mut = useSavePosition();
  const { register, control, handleSubmit, reset, setError, formState: { errors } } = useForm<PosValues>({ resolver: zodResolver(posSchema) });
  React.useEffect(() => { if (open) reset({ title: value?.title ?? '', departmentId: value?.departmentId ? String(value.departmentId) : '' }); }, [open, value, reset]);

  async function onSubmit(v: PosValues) {
    try {
      await mut.mutateAsync({ id: value?.id, data: { title: v.title.trim(), departmentId: v.departmentId ? Number(v.departmentId) : null } });
      toast.success(value ? 'Poste mis à jour.' : 'Poste créé.');
      onOpenChange(false);
    } catch (e) {
      if (isApiError(e) && e.status === 422) Object.entries(e.fieldErrors).forEach(([k, m]) => setError(k as keyof PosValues, { message: m }));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex min-h-0 flex-col">
          <DialogHeader><DialogTitle>{value ? 'Modifier le poste' : 'Nouveau poste'}</DialogTitle></DialogHeader>
          <DialogBody className="space-y-4">
            <FormField label="Intitulé" htmlFor="pos-title" error={errors.title} required><Input id="pos-title" {...register('title')} aria-invalid={!!errors.title} /></FormField>
            <FormField label="Département" htmlFor="pos-dep" error={errors.departmentId}>
              <Controller control={control} name="departmentId" render={({ field }) => (
                <Select id="pos-dep" value={field.value} onValueChange={field.onChange} allLabel="Transverse (tous départements)" options={(deps.data ?? []).filter((d) => d.active).map((d) => ({ value: String(d.id), label: d.name }))} />
              )} />
            </FormField>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mut.isPending}>Annuler</Button>
            <Button type="submit" loading={mut.isPending}>{value ? 'Enregistrer' : 'Créer'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DepartmentsTab() {
  const q = useDepartments();
  const [editing, setEditing] = React.useState<Department | null | undefined>(undefined);
  const [deactivating, setDeactivating] = React.useState<Department | null>(null);
  const deactivate = useDeactivateDepartment();
  const reactivate = useReactivateDepartment();
  const rows = q.data ?? [];
  const total = rows.filter((d) => d.active).reduce((s, d) => s + (d.employeesCount ?? 0), 0);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{rows.filter((d) => d.active).length} département(s) actif(s) · {total} employé(s) actif(s) rattaché(s)</p>
        <Button leftIcon={<Plus />} onClick={() => setEditing(null)}>Nouveau département</Button>
      </div>
      <TableContainer>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Département</TableHead>
              <TableHead>Responsable</TableHead>
              <TableHead align="right">Effectif</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead align="right"><span className="sr-only">Actions</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.isLoading ? <tr><td colSpan={5}><TableSkeleton rows={5} cols={4} /></td></tr>
              : q.error ? <tr><td colSpan={5}><QueryError error={q.error} onRetry={q.refetch} compact /></td></tr>
              : !rows.length ? <tr><td colSpan={5}><EmptyState compact icon={Building2} title="Aucun département" description="Créez les départements de l'entreprise pour organiser le personnel." /></td></tr>
              : rows.map((d) => (
                <TableRow key={d.id} className={d.active ? undefined : 'opacity-60'}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-xs font-semibold text-brand">{d.code.slice(0, 3)}</span>
                      <div className="min-w-0">
                        <div className="font-medium text-ink">{d.name}</div>
                        <div className="truncate text-xs text-muted">{d.description || `Code ${d.code}`}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {d.managerName ? (
                      <span className="inline-flex items-center gap-2"><Avatar name={d.managerName} size="xs" />{d.managerName}</span>
                    ) : <span className="text-sm text-muted">Non désigné</span>}
                  </TableCell>
                  <TableCell align="right">
                    <Link to={`/admin/employees?departmentId=${d.id}`} className="inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 font-medium tabular text-ink hover:bg-slate-100">
                      <Users className="h-3.5 w-3.5 text-muted" />{d.employeesCount ?? 0}
                    </Link>
                  </TableCell>
                  <TableCell>{d.active ? <Badge variant="success" dot>Actif</Badge> : <Badge variant="muted" dot>Inactif</Badge>}</TableCell>
                  <TableCell align="right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Actions pour ${d.name}`}><MoreHorizontal /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem icon={<Pencil />} onSelect={() => setEditing(d)}>Modifier</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {d.active
                          ? <DropdownMenuItem destructive icon={<PowerOff />} onSelect={() => setDeactivating(d)}>Désactiver</DropdownMenuItem>
                          : <DropdownMenuItem icon={<Power />} onSelect={() => reactivate.mutate(d.id, { onSuccess: () => toast.success('Département réactivé.') })}>Réactiver</DropdownMenuItem>}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </TableContainer>
      <DepartmentDialog value={editing} onOpenChange={(o) => !o && setEditing(undefined)} />
      <ConfirmDialog
        open={!!deactivating}
        onOpenChange={(o) => !o && setDeactivating(null)}
        title={`Désactiver « ${deactivating?.name} » ?`}
        description={deactivating?.employeesCount ? `${deactivating.employeesCount} employé(s) actif(s) y sont encore rattachés. Ils conservent leur rattachement ; pensez à les réaffecter.` : 'Le département ne sera plus proposé dans les formulaires. L’historique est conservé.'}
        confirmLabel="Désactiver"
        onConfirm={async () => { if (deactivating) await deactivate.mutateAsync(deactivating.id); }}
      />
    </>
  );
}

function PositionsTab() {
  const q = usePositions();
  const [search, setSearch] = React.useState('');
  const [editing, setEditing] = React.useState<Position | null | undefined>(undefined);
  const rows = (q.data ?? []).filter((p) => !search || `${p.title} ${p.departmentName ?? ''}`.toLowerCase().includes(search.toLowerCase()));
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="w-full sm:max-w-xs"><SearchInput value={search} onChange={setSearch} placeholder="Rechercher un poste…" /></div>
        <Button leftIcon={<Plus />} onClick={() => setEditing(null)}>Nouveau poste</Button>
      </div>
      <TableContainer>
        <Table>
          <TableHeader><TableRow><TableHead>Intitulé</TableHead><TableHead>Département</TableHead><TableHead align="right"><span className="sr-only">Actions</span></TableHead></TableRow></TableHeader>
          <TableBody>
            {q.isLoading ? <tr><td colSpan={3}><TableSkeleton rows={6} cols={2} /></td></tr>
              : q.error ? <tr><td colSpan={3}><QueryError error={q.error} onRetry={q.refetch} compact /></td></tr>
              : !rows.length ? <tr><td colSpan={3}><EmptyState compact icon={Briefcase} title={search ? 'Aucun poste trouvé' : 'Aucun poste'} /></td></tr>
              : rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium text-ink">{p.title}</TableCell>
                  <TableCell>{p.departmentName ?? <Badge variant="muted">Transverse</Badge>}</TableCell>
                  <TableCell align="right"><Button variant="ghost" size="sm" leftIcon={<Pencil />} onClick={() => setEditing(p)}>Modifier</Button></TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </TableContainer>
      <PositionDialog value={editing} onOpenChange={(o) => !o && setEditing(undefined)} />
    </>
  );
}

export default function AdminDepartmentsPage() {
  return (
    <div>
      <PageHeader title="Départements & postes" description="Structure de l'organisation, responsables et effectifs." />
      <Tabs defaultValue="departments">
        <TabsList className="mb-4">
          <TabsTrigger value="departments"><Building2 />Départements</TabsTrigger>
          <TabsTrigger value="positions"><Briefcase />Postes</TabsTrigger>
        </TabsList>
        <TabsContent value="departments"><DepartmentsTab /></TabsContent>
        <TabsContent value="positions"><PositionsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
