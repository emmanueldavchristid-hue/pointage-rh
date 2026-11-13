import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Button, DatePicker, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, FormField, Select, Textarea,
} from '@/components/ui';
import { addDaysISO, getTimezone, todayISO } from '@/lib/format';
import { isApiError } from '@/lib/api';
import { useEmployeeSelectOptions } from '@/features/org/api';
import { useExceptionalAttendance } from '../api';
import { localToISO } from '../time';

const schema = z.object({
  employeeId: z.string().min(1, 'Sélectionnez un employé.'),
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide.'),
  arrival: z.string(),
  departure: z.string(),
  reason: z.string().trim().min(5, 'Le motif doit contenir au moins 5 caractères.').max(500),
}).refine((v) => v.arrival || v.departure, { message: 'Indiquez au moins une heure d’arrivée ou de départ.', path: ['arrival'] });
type Values = z.infer<typeof schema>;

/** Ajout d'un pointage exceptionnel (oubli total, panne, mission) — POST /attendance/exceptional. */
export function ExceptionalDialog({ open, onOpenChange, defaultEmployeeId, defaultDate }: { open: boolean; onOpenChange: (o: boolean) => void; defaultEmployeeId?: number; defaultDate?: string }) {
  const empOptions = useEmployeeSelectOptions();
  const mut = useExceptionalAttendance();
  const { control, register, handleSubmit, reset, setError, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(schema),
    values: { employeeId: defaultEmployeeId ? String(defaultEmployeeId) : '', workDate: defaultDate ?? todayISO(), arrival: '', departure: '', reason: '' },
  });

  async function onSubmit(v: Values) {
    const nextDay = v.arrival && v.departure && v.departure < v.arrival;
    try {
      await mut.mutateAsync({
        employeeId: Number(v.employeeId),
        workDate: v.workDate,
        arrivalAt: v.arrival ? localToISO(v.workDate, v.arrival) : undefined,
        departureAt: v.departure ? localToISO(nextDay ? addDaysISO(v.workDate, 1) : v.workDate, v.departure) : undefined,
        reason: v.reason.trim(),
      });
      reset();
      onOpenChange(false);
    } catch (e) {
      if (isApiError(e) && e.status === 422) Object.entries(e.fieldErrors).forEach(([k, m]) => setError((k === 'arrivalAt' ? 'arrival' : k === 'departureAt' ? 'departure' : k) as keyof Values, { message: m }));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex min-h-0 flex-col">
          <DialogHeader>
            <DialogTitle>Ajouter un pointage exceptionnel</DialogTitle>
            <DialogDescription>Saisie manuelle tracée, en heure locale de l'entreprise ({getTimezone()}).</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <FormField label="Employé" htmlFor="exc-emp" error={errors.employeeId} required>
              <Controller control={control} name="employeeId" render={({ field }) => (
                <Select id="exc-emp" value={field.value} onValueChange={field.onChange} options={empOptions} placeholder="Choisir un employé" aria-invalid={!!errors.employeeId} />
              )} />
            </FormField>
            <FormField label="Journée" htmlFor="exc-date" error={errors.workDate} required>
              <Controller control={control} name="workDate" render={({ field }) => (
                <DatePicker id="exc-date" value={field.value} onChange={field.onChange} max={todayISO()} />
              )} />
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Arrivée" htmlFor="exc-arr" error={errors.arrival}>
                <Controller control={control} name="arrival" render={({ field }) => <DatePicker id="exc-arr" type="time" value={field.value} onChange={field.onChange} />} />
              </FormField>
              <FormField label="Départ" htmlFor="exc-dep" error={errors.departure}>
                <Controller control={control} name="departure" render={({ field }) => <DatePicker id="exc-dep" type="time" value={field.value} onChange={field.onChange} />} />
              </FormField>
            </div>
            <FormField label="Motif" htmlFor="exc-reason" error={errors.reason} required>
              <Textarea id="exc-reason" rows={3} placeholder="Ex. : panne du réseau, présence attestée par le responsable." {...register('reason')} />
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
