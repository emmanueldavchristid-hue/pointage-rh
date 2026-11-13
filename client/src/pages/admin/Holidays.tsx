import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CalendarDays, ChevronLeft, ChevronRight, Plus, Repeat, Trash2 } from 'lucide-react';
import {
  Badge, Button, Card, CardHeader, Checkbox, ConfirmDialog, DatePicker, Dialog, DialogBody, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle, EmptyState, FormField, Input, Label, PageHeader, TableSkeleton,
} from '@/components/ui';
import { Callout, LoadError } from '@/features/admin/shared';
import { useCreateHoliday, useDeleteHoliday, useHolidays, type Holiday } from '@/features/schedules/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { isApiError } from '@/lib/api';
import { formatDateLong, formatWeekday, todayISO } from '@/lib/format';

const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choisissez une date.'),
  label: z.string().trim().min(2, 'Libellé trop court (2 caractères minimum).').max(120, 'Libellé trop long.'),
  recurring: z.boolean(),
});
type Values = z.infer<typeof schema>;

/** Occurrence d'un jour férié pour une année donnée (récurrent = même jour/mois chaque année). */
function occurrence(h: Holiday, year: number): string | null {
  if (h.recurring) return `${year}-${h.date.slice(5)}`;
  return h.date.startsWith(String(year)) ? h.date : null;
}

export default function AdminHolidaysPage() {
  const { hasRole } = useAuth();
  const canEdit = hasRole('SUPER_ADMIN', 'HR_ADMIN');
  const q = useHolidays();
  const [year, setYear] = React.useState(() => Number(todayISO().slice(0, 4)));
  const [createOpen, setCreateOpen] = React.useState(false);
  const [toDelete, setToDelete] = React.useState<Holiday | null>(null);
  const del = useDeleteHoliday();

  const rows = React.useMemo(() => {
    return (q.data ?? [])
      .map((h) => ({ h, date: occurrence(h, year) }))
      .filter((r): r is { h: Holiday; date: string } => !!r.date)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [q.data, year]);
  const today = todayISO();
  const next = rows.find((r) => r.date >= today);

  return (
    <div>
      <PageHeader
        title="Jours fériés"
        description="Les jours fériés sont exclus des jours travaillés : aucune absence n'y est comptée."
        actions={canEdit && <Button leftIcon={<Plus />} onClick={() => setCreateOpen(true)}>Ajouter un jour férié</Button>}
      />

      <Callout title="Fêtes à date variable" tone="warning" className="mb-6">
        Les fêtes mobiles (lundi de Pâques, Ascension, lundi de Pentecôte, Tabaski, Korité / fin du Ramadan, Maouloud, lendemain
        de la Nuit du Destin…) changent de date chaque année : ajoutez-les comme jours non récurrents dès que les dates officielles
        sont publiées.
      </Callout>

      <Card>
        <CardHeader
          title={
            <span className="flex items-center gap-2">
              <Button variant="ghost" size="icon-sm" onClick={() => setYear((y) => y - 1)} aria-label="Année précédente"><ChevronLeft /></Button>
              <span className="min-w-[4ch] text-center tabular">{year}</span>
              <Button variant="ghost" size="icon-sm" onClick={() => setYear((y) => y + 1)} aria-label="Année suivante"><ChevronRight /></Button>
            </span>
          }
          description={q.isSuccess ? `${rows.length} jour${rows.length > 1 ? 's' : ''} férié${rows.length > 1 ? 's' : ''} en ${year}${next && year === Number(today.slice(0, 4)) ? ` · prochain : ${next.h.label}, ${formatDateLong(next.date)}` : ''}` : undefined}
        />
        {q.isPending ? (
          <div className="p-4"><TableSkeleton rows={6} cols={3} /></div>
        ) : q.isError ? (
          <LoadError error={q.error} onRetry={q.refetch} />
        ) : rows.length === 0 ? (
          <EmptyState icon={CalendarDays} title={`Aucun jour férié en ${year}`} description="Ajoutez les jours fériés légaux et les fêtes mobiles de l'année." compact
            action={canEdit && <Button size="sm" leftIcon={<Plus />} onClick={() => setCreateOpen(true)}>Ajouter</Button>} />
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map(({ h, date }) => {
              const past = date < today;
              return (
                <li key={h.id} className="flex items-center gap-4 px-5 py-3.5">
                  <div className={`flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl border ${past ? 'border-slate-200 bg-slate-50 text-slate-400' : 'border-brand-200 bg-brand-50 text-brand-700'}`}>
                    <span className="text-[15px] font-semibold leading-none tabular">{date.slice(8, 10)}</span>
                    <span className="mt-0.5 text-[10px] font-medium uppercase">{new Intl.DateTimeFormat('fr-FR', { month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`)).replace('.', '')}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`truncate font-medium ${past ? 'text-slate-500' : 'text-ink'}`}>{h.label}</p>
                    <p className="text-xs text-muted">{formatWeekday(date)}{past ? ' · passé' : ''}</p>
                  </div>
                  {h.recurring ? (
                    <Badge variant="brand"><Repeat className="h-3 w-3" />Chaque année</Badge>
                  ) : (
                    <Badge variant="neutral">Date unique</Badge>
                  )}
                  {canEdit && (
                    <Button variant="ghost" size="icon-sm" onClick={() => setToDelete(h)} aria-label={`Supprimer ${h.label}`}>
                      <Trash2 className="text-slate-500" />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <HolidayDialog open={createOpen} onOpenChange={setCreateOpen} defaultYear={year} />

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Supprimer ce jour férié ?"
        description={toDelete ? `« ${toDelete.label} »${toDelete.recurring ? ' sera retiré pour toutes les années' : ''}. Les journées concernées seront de nouveau considérées comme travaillées lors des prochains calculs.` : undefined}
        confirmLabel="Supprimer"
        onConfirm={() => del.mutateAsync(toDelete!.id)}
      />
    </div>
  );
}

function HolidayDialog({ open, onOpenChange, defaultYear }: { open: boolean; onOpenChange: (o: boolean) => void; defaultYear: number }) {
  const create = useCreateHoliday();
  const { register, handleSubmit, reset, setValue, watch, setError, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { date: '', label: '', recurring: false },
  });
  React.useEffect(() => {
    if (open) reset({ date: '', label: '', recurring: false });
  }, [open, reset]);

  async function onSubmit(v: Values) {
    try {
      await create.mutateAsync(v);
      onOpenChange(false);
    } catch (e) {
      if (isApiError(e) && e.status === 422) Object.entries(e.fieldErrors).forEach(([k, m]) => setError(k as keyof Values, { message: m }));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <DialogHeader>
            <DialogTitle>Ajouter un jour férié</DialogTitle>
            <DialogDescription>Le jour sera exclu des jours travaillés de tous les horaires.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <FormField label="Date" htmlFor="h-date" error={errors.date} required>
              <DatePicker id="h-date" value={watch('date')} min={`${defaultYear - 1}-01-01`} onChange={(v) => setValue('date', v, { shouldValidate: true })} aria-invalid={!!errors.date} />
            </FormField>
            <FormField label="Libellé" htmlFor="h-label" error={errors.label} required>
              <Input id="h-label" placeholder="Ex. Lundi de Pâques" {...register('label')} aria-invalid={!!errors.label} />
            </FormField>
            <div className="flex items-start gap-3 rounded-lg border border-slate-200 p-3">
              <Checkbox id="h-rec" checked={watch('recurring')} onCheckedChange={(c) => setValue('recurring', c === true)} className="mt-0.5" />
              <div>
                <Label htmlFor="h-rec">Récurrent chaque année</Label>
                <p className="text-xs text-muted">Uniquement pour les fêtes à date fixe (1er janvier, 7 août…). Ne pas cocher pour les fêtes mobiles.</p>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
            <Button type="submit" loading={create.isPending}>Ajouter</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
