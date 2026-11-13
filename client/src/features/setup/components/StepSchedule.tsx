import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { ArrowRight, RotateCcw } from 'lucide-react';
import { Button, DatePicker, FormField, Input, Skeleton, Switch } from '@/components/ui';
import { QueryError } from '@/features/employee/components/QueryError';
import { errorMessage, isApiError } from '@/lib/api';
import { dayName, formatDuration, todayISO } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useSaveSchedule, useSchedulesList, type ScheduleVersionInput } from '../api';
import { BackButton, SectionTitle, StepShell } from './StepShell';

const hhmm = z.string().regex(/^\d{2}:\d{2}$/, 'Heure requise (HH:MM).');
const optHhmm = z.string().regex(/^(\d{2}:\d{2})?$/, 'Heure invalide (HH:MM).');
const minutes = (max: number) => z.number({ error: 'Nombre requis.' }).int('Nombre entier attendu.').min(0, 'Valeur positive attendue.').max(max, `${max} maximum.`);

const schema = z.object({
  effectiveFrom: z.string().min(1, "Indiquez la date d'effet."),
  startTime: hhmm,
  endTime: hhmm,
  breakStart: optHhmm,
  breakEnd: optHhmm,
  workDays: z.array(z.number()).min(1, 'Sélectionnez au moins un jour ouvré.'),
  dailyMinutes: z.number({ error: 'Durée requise.' }).int().min(1, 'Durée requise.').max(1440, '24 h maximum.'),
  lateToleranceMin: minutes(240),
  earlyLeaveToleranceMin: minutes(240),
  overtimeThresholdMin: minutes(600),
  breakTracking: z.boolean(),
  maxBreaks: z.number({ error: 'Nombre requis.' }).int().min(0).max(10, '10 maximum.'),
  arrivalWindowBeforeMin: minutes(720),
})
  .refine((v) => (!v.breakStart && !v.breakEnd) || (!!v.breakStart && !!v.breakEnd), { path: ['breakEnd'], message: 'Renseignez le début et la fin de la pause, ou aucun des deux.' })
  .refine((v) => !v.breakStart || !v.breakEnd || v.breakEnd > v.breakStart, { path: ['breakEnd'], message: 'La fin de pause doit suivre son début.' })
  .refine((v) => !v.breakTracking || v.maxBreaks >= 1, { path: ['maxBreaks'], message: 'Au moins une pause si les pauses sont pointées.' });
type Values = z.infer<typeof schema>;

/** Propositions initiales (modifiables) si aucun horaire par défaut n'existe encore. */
const SUGGESTED: Values = {
  effectiveFrom: todayISO(),
  startTime: '08:00', endTime: '17:00', breakStart: '12:00', breakEnd: '13:00',
  workDays: [1, 2, 3, 4, 5],
  dailyMinutes: 480,
  lateToleranceMin: 10, earlyLeaveToleranceMin: 0, overtimeThresholdMin: 15,
  breakTracking: false, maxBreaks: 1, arrivalWindowBeforeMin: 120,
};

const toMin = (t?: string | null) => {
  if (!t || !/^\d{2}:\d{2}$/.test(t)) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
/** Durée théorique = amplitude (arrivée → départ, nuit possible) − pause. */
export function computeDailyMinutes(start: string, end: string, bs?: string | null, be?: string | null): number | null {
  const s = toMin(start), e = toMin(end);
  if (s === null || e === null) return null;
  let span = e - s;
  if (span <= 0) span += 1440;
  const b1 = toMin(bs), b2 = toMin(be);
  const pause = b1 !== null && b2 !== null && b2 > b1 ? b2 - b1 : 0;
  return Math.max(0, span - pause);
}

function NumberField({ id, label, hint, error, suffix = 'min', ...rest }: { id: string; label: string; hint?: string; error?: { message?: string }; suffix?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <FormField label={label} htmlFor={id} error={error?.message} hint={hint}>
      <div className="relative">
        <Input id={id} type="number" inputMode="numeric" min={0} className="pr-12 tabular" aria-invalid={!!error} {...rest} />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted">{suffix}</span>
      </div>
    </FormField>
  );
}

export function StepSchedule({ onDone, onBack }: { onDone: () => void; onBack?: () => void }) {
  const q = useSchedulesList();
  const save = useSaveSchedule();
  const [manualDuration, setManualDuration] = React.useState(false);
  const { register, control, handleSubmit, reset, watch, setValue, setError, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: SUGGESTED,
  });

  const current = React.useMemo(() => (q.data ?? []).find((s) => s.isDefault)?.currentVersion ?? null, [q.data]);
  React.useEffect(() => {
    if (!current) return;
    reset({
      effectiveFrom: current.effectiveFrom?.slice(0, 10) ?? todayISO(),
      startTime: current.startTime, endTime: current.endTime,
      breakStart: current.breakStart ?? '', breakEnd: current.breakEnd ?? '',
      workDays: current.workDays, dailyMinutes: current.dailyMinutes,
      lateToleranceMin: current.lateToleranceMin, earlyLeaveToleranceMin: current.earlyLeaveToleranceMin,
      overtimeThresholdMin: current.overtimeThresholdMin, breakTracking: current.breakTracking,
      maxBreaks: current.maxBreaks, arrivalWindowBeforeMin: current.arrivalWindowBeforeMin,
    });
    const auto = computeDailyMinutes(current.startTime, current.endTime, current.breakStart, current.breakEnd);
    setManualDuration(auto !== null && auto !== current.dailyMinutes);
  }, [current, reset]);

  const [startTime, endTime, breakStart, breakEnd, breakTracking, dailyMinutes] = watch(['startTime', 'endTime', 'breakStart', 'breakEnd', 'breakTracking', 'dailyMinutes']);
  const computed = computeDailyMinutes(startTime, endTime, breakStart, breakEnd);
  React.useEffect(() => {
    if (!manualDuration && computed !== null) setValue('dailyMinutes', computed, { shouldValidate: true });
  }, [computed, manualDuration, setValue]);

  const onSubmit = handleSubmit(async (v) => {
    const body: ScheduleVersionInput = {
      ...v,
      breakStart: v.breakStart || null,
      breakEnd: v.breakEnd || null,
      workDays: [...v.workDays].sort((a, b) => a - b),
      maxBreaks: v.breakTracking ? v.maxBreaks : Math.max(0, v.maxBreaks),
    };
    try {
      await save.mutateAsync(body);
      toast.success('Horaire par défaut enregistré.');
      onDone();
    } catch (e) {
      if (isApiError(e) && e.status === 422 && Object.keys(e.fieldErrors).length) Object.entries(e.fieldErrors).forEach(([k, m]) => setError(k as keyof Values, { message: m }));
      else toast.error(errorMessage(e));
    }
  });

  const num = { valueAsNumber: true } as const;

  return (
    <form onSubmit={onSubmit} noValidate>
      <StepShell
        title="Horaire par défaut"
        description="Il s'applique à tous les employés sans horaire spécifique. Vous pourrez créer d'autres horaires (équipes, départements) ensuite."
        footer={<><BackButton onClick={onBack} /><Button type="submit" size="lg" rightIcon={<ArrowRight />} loading={isSubmitting}>Enregistrer et continuer</Button></>}
      >
        {q.isPending ? (
          <div className="space-y-3"><Skeleton className="h-10" /><Skeleton className="h-24" /><Skeleton className="h-10" /></div>
        ) : q.isError ? (
          <QueryError error={q.error} onRetry={q.refetch} />
        ) : (
          <div className="space-y-7">
            <div>
              <SectionTitle>Journée type</SectionTitle>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {(['startTime', 'endTime', 'breakStart', 'breakEnd'] as const).map((name) => (
                  <FormField key={name} label={{ startTime: 'Arrivée', endTime: 'Départ', breakStart: 'Début de pause', breakEnd: 'Fin de pause' }[name]} htmlFor={name} error={errors[name]} required={name === 'startTime' || name === 'endTime'}>
                    <Controller control={control} name={name} render={({ field }) => (
                      <DatePicker id={name} type="time" value={field.value ?? ''} onChange={field.onChange} aria-invalid={!!errors[name]} />
                    )} />
                  </FormField>
                ))}
              </div>
            </div>

            <div>
              <SectionTitle>Jours ouvrés</SectionTitle>
              <Controller control={control} name="workDays" render={({ field }) => (
                <div className="flex flex-wrap gap-2" role="group" aria-label="Jours ouvrés">
                  {[1, 2, 3, 4, 5, 6, 7].map((d) => {
                    const on = field.value.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={on}
                        title={dayName(d)}
                        onClick={() => field.onChange(on ? field.value.filter((x) => x !== d) : [...field.value, d])}
                        className={cn('h-11 min-w-[56px] rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30',
                          on ? 'border-brand bg-brand text-white hover:bg-brand-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50')}
                      >
                        {dayName(d, true)}
                      </button>
                    );
                  })}
                </div>
              )} />
              {errors.workDays && <p className="mt-1.5 text-xs font-medium text-danger" role="alert">{errors.workDays.message}</p>}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <NumberField
                  id="dailyMinutes"
                  label="Durée théorique journalière"
                  error={errors.dailyMinutes}
                  hint={manualDuration ? `Saisie manuelle (${formatDuration(dailyMinutes || 0)}).` : `Calculée automatiquement : ${computed !== null ? formatDuration(computed) : '—'} (amplitude moins la pause).`}
                  {...register('dailyMinutes', { ...num, onChange: () => setManualDuration(true) })}
                />
                {manualDuration && computed !== null && (
                  <button type="button" onClick={() => setManualDuration(false)} className="mt-1 inline-flex min-h-[32px] items-center gap-1 text-xs font-medium text-brand hover:underline">
                    <RotateCcw className="h-3 w-3" aria-hidden /> Revenir au calcul automatique
                  </button>
                )}
              </div>
              <FormField label="Date d'effet" htmlFor="effectiveFrom" error={errors.effectiveFrom} required hint="Les journées antérieures ne sont pas recalculées.">
                <Controller control={control} name="effectiveFrom" render={({ field }) => <DatePicker id="effectiveFrom" value={field.value} onChange={field.onChange} />} />
              </FormField>
            </div>

            <div>
              <SectionTitle>Tolérances et heures supplémentaires</SectionTitle>
              <div className="grid gap-4 sm:grid-cols-2">
                <NumberField id="lateToleranceMin" label="Tolérance de retard" hint="En deçà, l'arrivée n'est pas comptée en retard." error={errors.lateToleranceMin} {...register('lateToleranceMin', num)} />
                <NumberField id="earlyLeaveToleranceMin" label="Tolérance de départ anticipé" error={errors.earlyLeaveToleranceMin} {...register('earlyLeaveToleranceMin', num)} />
                <NumberField id="overtimeThresholdMin" label="Seuil d'heures supplémentaires" hint="Dépassement minimal avant de proposer des heures sup." error={errors.overtimeThresholdMin} {...register('overtimeThresholdMin', num)} />
                <NumberField id="arrivalWindowBeforeMin" label="Pointage d'arrivée possible dès" hint="Minutes avant l'heure d'arrivée prévue." error={errors.arrivalWindowBeforeMin} {...register('arrivalWindowBeforeMin', num)} />
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-ink">Pauses pointées</p>
                  <p className="text-xs leading-relaxed text-muted">Les employés scannent un QR Code au début et à la fin de chaque pause. Sinon, la pause prévue est déduite automatiquement.</p>
                </div>
                <Controller control={control} name="breakTracking" render={({ field }) => (
                  <Switch checked={field.value} onCheckedChange={field.onChange} aria-label="Activer les pauses pointées" />
                )} />
              </div>
              {breakTracking && (
                <div className="mt-4 max-w-xs">
                  <NumberField id="maxBreaks" label="Nombre maximal de pauses par jour" suffix="" error={errors.maxBreaks} {...register('maxBreaks', num)} />
                </div>
              )}
            </div>
          </div>
        )}
      </StepShell>
    </form>
  );
}
