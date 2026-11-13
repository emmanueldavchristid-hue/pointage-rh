import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { FileCheck2, Pencil, Plus, Tags } from 'lucide-react';
import {
  Badge, Button, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, EmptyState,
  FormField, Input, Label, Select, Switch, Table, TableBody, TableCell, TableContainer, TableEmptyRow, TableHead, TableHeader,
  TableRow, TableSkeleton,
} from '@/components/ui';
import { LoadError } from '@/features/admin/shared';
import { isApiError } from '@/lib/api';
import { labelOf } from '@/lib/labels';
import { LEAVE_CATEGORY, useLeaveTypes, useSaveLeaveType, type LeaveType } from '../api';
import { TypeDot } from './LeaveDetailDialog';

const PALETTE = ['#2563EB', '#16A34A', '#D97706', '#DC2626', '#7C3AED', '#0891B2', '#DB2777', '#64748B'];

const schema = z.object({
  code: z.string().trim().min(2, 'Code trop court.').max(20, 'Code trop long.').regex(/^[A-Z0-9_]+$/, 'Majuscules, chiffres et « _ » uniquement.'),
  label: z.string().trim().min(2, 'Libellé trop court.').max(80, 'Libellé trop long.'),
  category: z.string().min(1, 'Choisissez une catégorie.'),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Couleur hexadécimale attendue (#RRGGBB).'),
  requiresJustification: z.boolean(),
  active: z.boolean(),
});
type Values = z.infer<typeof schema>;

export function LeaveTypesPanel({ canEdit }: { canEdit: boolean }) {
  const q = useLeaveTypes();
  const [edit, setEdit] = React.useState<LeaveType | 'new' | null>(null);
  return (
    <TableContainer>
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-4">
        <div>
          <p className="text-sm font-semibold text-ink">Types de congés et permissions</p>
          <p className="text-xs text-muted">Proposés aux employés lors de leurs demandes ; la couleur est utilisée dans le calendrier.</p>
        </div>
        {canEdit && <Button size="sm" leftIcon={<Plus />} onClick={() => setEdit('new')}>Nouveau type</Button>}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Libellé</TableHead>
            <TableHead>Code</TableHead>
            <TableHead>Catégorie</TableHead>
            <TableHead>Justificatif</TableHead>
            <TableHead>État</TableHead>
            {canEdit && <TableHead align="right"><span className="sr-only">Actions</span></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {q.isPending ? (
            <TableEmptyRow colSpan={6}><div className="p-4"><TableSkeleton rows={4} cols={5} /></div></TableEmptyRow>
          ) : q.isError ? (
            <TableEmptyRow colSpan={6}><LoadError error={q.error} onRetry={q.refetch} compact /></TableEmptyRow>
          ) : q.data.length === 0 ? (
            <TableEmptyRow colSpan={6}><EmptyState compact icon={Tags} title="Aucun type de congé" description="Créez les types (congé annuel, permission exceptionnelle, maladie…)." /></TableEmptyRow>
          ) : q.data.map((t) => (
            <TableRow key={t.id} className={t.active === false ? 'opacity-60' : undefined}>
              <TableCell><span className="flex items-center gap-2 font-medium text-ink"><TypeDot color={t.color} />{t.label}</span></TableCell>
              <TableCell className="font-mono text-xs">{t.code}</TableCell>
              <TableCell>{labelOf(LEAVE_CATEGORY, t.category)}</TableCell>
              <TableCell>{t.requiresJustification ? <Badge variant="warning"><FileCheck2 className="h-3 w-3" />Requis</Badge> : <span className="text-muted">Facultatif</span>}</TableCell>
              <TableCell>{t.active === false ? <Badge variant="muted">Inactif</Badge> : <Badge variant="success" dot>Actif</Badge>}</TableCell>
              {canEdit && (
                <TableCell align="right">
                  <Button variant="ghost" size="icon-sm" onClick={() => setEdit(t)} aria-label={`Modifier ${t.label}`}><Pencil /></Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <LeaveTypeDialog value={edit} onOpenChange={(o) => !o && setEdit(null)} />
    </TableContainer>
  );
}

function LeaveTypeDialog({ value, onOpenChange }: { value: LeaveType | 'new' | null; onOpenChange: (o: boolean) => void }) {
  const save = useSaveLeaveType();
  const editing = value && value !== 'new' ? value : null;
  const defaults: Values = editing
    ? { code: editing.code, label: editing.label, category: editing.category, color: editing.color ?? PALETTE[0], requiresJustification: editing.requiresJustification, active: editing.active !== false }
    : { code: '', label: '', category: 'CONGE', color: PALETTE[0], requiresJustification: false, active: true };
  const { register, control, handleSubmit, reset, watch, setValue, setError, formState: { errors } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });
  React.useEffect(() => { if (value) reset(defaults); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const color = watch('color');
  const categories = Object.entries(LEAVE_CATEGORY).map(([v, label]) => ({ value: v, label }));
  if (editing && !LEAVE_CATEGORY[editing.category]) categories.push({ value: editing.category, label: labelOf({}, editing.category) });

  async function onSubmit(v: Values) {
    try {
      await save.mutateAsync({ ...v, id: editing?.id });
      onOpenChange(false);
    } catch (e) {
      if (isApiError(e) && e.status === 422) Object.entries(e.fieldErrors).forEach(([k, m]) => setError(k as keyof Values, { message: m }));
      if (isApiError(e) && e.status === 409) setError('code', { message: e.message });
    }
  }

  return (
    <Dialog open={!!value} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <form noValidate onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>{editing ? 'Modifier le type' : 'Nouveau type de congé'}</DialogTitle>
            <DialogDescription>Les demandes existantes conservent leur type.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_160px]">
              <FormField label="Libellé" htmlFor="lt-label" error={errors.label} required>
                <Input id="lt-label" placeholder="Ex. Congé annuel" {...register('label')} aria-invalid={!!errors.label} />
              </FormField>
              <FormField label="Code" htmlFor="lt-code" error={errors.code} required>
                <Input id="lt-code" className="font-mono uppercase" placeholder="CONGE_ANNUEL" {...register('code', { setValueAs: (v: string) => v.toUpperCase().trim() })} aria-invalid={!!errors.code} />
              </FormField>
            </div>
            <FormField label="Catégorie" htmlFor="lt-cat" error={errors.category} required hint="Détermine le statut de la journée (congé, permission, mission…).">
              <Controller control={control} name="category" render={({ field }) => <Select id="lt-cat" value={field.value} onValueChange={field.onChange} options={categories} />} />
            </FormField>
            <FormField label="Couleur" htmlFor="lt-color" error={errors.color}>
              <div className="flex flex-wrap items-center gap-2">
                {PALETTE.map((c) => (
                  <button key={c} type="button" onClick={() => setValue('color', c, { shouldDirty: true })} aria-label={`Couleur ${c}`} aria-pressed={color === c}
                    className={`h-8 w-8 rounded-full ring-offset-2 transition ${color === c ? 'ring-2 ring-ink' : 'hover:scale-110'}`} style={{ backgroundColor: c }} />
                ))}
                <Input id="lt-color" className="ml-2 w-28 font-mono" {...register('color')} aria-invalid={!!errors.color} />
              </div>
            </FormField>
            <div className="space-y-2">
              {(['requiresJustification', 'active'] as const).map((name) => (
                <div key={name} className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                  <div>
                    <Label htmlFor={`lt-${name}`}>{name === 'active' ? 'Type actif' : 'Justificatif obligatoire'}</Label>
                    <p className="text-xs text-muted">{name === 'active' ? 'Inactif : n\'est plus proposé aux employés.' : 'Ex. certificat médical, acte de mariage…'}</p>
                  </div>
                  <Controller control={control} name={name} render={({ field }) => <Switch id={`lt-${name}`} checked={field.value} onCheckedChange={field.onChange} />} />
                </div>
              ))}
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
            <Button type="submit" loading={save.isPending}>Enregistrer</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
