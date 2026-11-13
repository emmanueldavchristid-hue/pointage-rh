
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Info } from 'lucide-react';
import { Button, DatePicker, FormField, Select, Textarea } from '@/components/ui';
import { DAY_STATUS } from '@/lib/labels';
import { addDaysISO, getTimezone } from '@/lib/format';
import type { DayStatus } from '@/lib/types';
import { useCorrectAttendance, type AttendanceDetail, type CorrectionInput } from '../api';
import { CORRECTABLE_DAY_STATUS } from '../labels';
import { isoToLocalTime, localToISO } from '../time';
import { isApiError } from '@/lib/api';

const schema = z.object({
  arrival: z.string(),
  departure: z.string(),
  dayStatus: z.string(),
  reason: z.string().trim().min(5, 'Le motif doit contenir au moins 5 caractères.').max(500, '500 caractères maximum.'),
});
type Values = z.infer<typeof schema>;

/** Correction d'une journée : heures saisies en heure locale entreprise, converties en ISO UTC. */
export function CorrectionForm({ att, onDone, onCancel }: { att: AttendanceDetail; onDone: () => void; onCancel: () => void }) {
  const initialArr = isoToLocalTime(att.arrivalAt);
  const initialDep = isoToLocalTime(att.departureAt);
  const { register, control, handleSubmit, setError, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { arrival: initialArr, departure: initialDep, dayStatus: '', reason: '' },
  });
  const mut = useCorrectAttendance();

  async function onSubmit(v: Values) {
    const body: CorrectionInput = { reason: v.reason.trim() };
    if (v.arrival !== initialArr) body.arrivalAt = v.arrival ? localToISO(att.workDate, v.arrival) : null;
    if (v.departure !== initialDep) {
      // Départ antérieur à l'arrivée = journée de nuit : départ le lendemain.
      const nextDay = v.arrival && v.departure && v.departure < v.arrival;
      body.departureAt = v.departure ? localToISO(nextDay ? addDaysISO(att.workDate, 1) : att.workDate, v.departure) : null;
    }
    if (v.dayStatus) body.dayStatus = v.dayStatus as DayStatus;
    if (body.arrivalAt === undefined && body.departureAt === undefined && !body.dayStatus) {
      setError('arrival', { message: 'Modifiez au moins une heure ou la qualification de la journée.' });
      return;
    }
    try {
      await mut.mutateAsync({ id: att.id, data: body });
      onDone();
    } catch (e) {
      if (isApiError(e) && e.status === 422) {
        Object.entries(e.fieldErrors).forEach(([k, m]) => {
          const key = k === 'arrivalAt' ? 'arrival' : k === 'departureAt' ? 'departure' : (k as keyof Values);
          if (['arrival', 'departure', 'dayStatus', 'reason'].includes(key)) setError(key as keyof Values, { message: m });
        });
      }
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="flex gap-2.5 rounded-lg border border-brand-100 bg-brand-50/60 p-3 text-sm text-slate-700">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
        <p>
          Heures en heure locale de l'entreprise ({getTimezone()}). Les pointages d'origine sont conservés et marqués comme remplacés ;
          la correction est tracée avec votre identifiant et le motif.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField label="Heure d'arrivée" htmlFor="corr-arrival" error={errors.arrival} hint={initialArr ? `Actuelle : ${initialArr}` : 'Aucune arrivée enregistrée'}>
          <Controller control={control} name="arrival" render={({ field }) => (
            <DatePicker id="corr-arrival" type="time" value={field.value} onChange={field.onChange} aria-invalid={!!errors.arrival} />
          )} />
        </FormField>
        <FormField label="Heure de départ" htmlFor="corr-departure" error={errors.departure} hint={initialDep ? `Actuelle : ${initialDep}` : 'Aucun départ enregistré'}>
          <Controller control={control} name="departure" render={({ field }) => (
            <DatePicker id="corr-departure" type="time" value={field.value} onChange={field.onChange} aria-invalid={!!errors.departure} />
          )} />
        </FormField>
      </div>
      <FormField label="Qualification de la journée" htmlFor="corr-status" error={errors.dayStatus} hint="Optionnel : laissez vide pour un recalcul automatique.">
        <Controller control={control} name="dayStatus" render={({ field }) => (
          <Select
            id="corr-status"
            value={field.value}
            onValueChange={field.onChange}
            allLabel="Recalcul automatique"
            options={CORRECTABLE_DAY_STATUS.map((s) => ({ value: s, label: DAY_STATUS[s].label }))}
          />
        )} />
      </FormField>
      <FormField label="Motif de la correction" htmlFor="corr-reason" error={errors.reason} required>
        <Textarea id="corr-reason" rows={3} placeholder="Ex. : oubli de pointage de sortie confirmé par le responsable." {...register('reason')} aria-invalid={!!errors.reason} />
      </FormField>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={onCancel} disabled={mut.isPending}>Annuler</Button>
        <Button type="submit" loading={mut.isPending}>Enregistrer la correction</Button>
      </div>
    </form>
  );
}

