import * as React from 'react';
import { Controller, useForm, type UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Moon, RotateCcw } from 'lucide-react';
import { Badge, Button, DatePicker, FormField, Label, Switch } from '@/components/ui';
import { FormSection, NumberInput, WeekdayChips } from '@/features/admin/shared';
import { formatDuration, todayISO } from '@/lib/format';
import { isApiError } from '@/lib/api';
import { computeDailyMinutes, isNightSchedule, type ScheduleVersion, type ScheduleVersionInput } from '../api';

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Heure invalide (HH:mm).');
const optTime = z.union([time, z.literal('')]);
const int = (min: number, max: number, label: string) =>
  z.number({ error: `${label} : nombre requis.` }).int(`${label} : nombre entier attendu.`).min(min, `${label} : minimum ${min}.`).max(max, `${label} : maximum ${max}.`);

export const versionSchema = z
  .object({
    effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choisissez la date d'effet."),
    startTime: time,
    endTime: time,
    breakStart: optTime,
    breakEnd: optTime,
    workDays: z.array(z.number().int().min(1).max(7)).min(1, 'Sélectionnez au moins un jour travaillé.'),
    dailyMinutes: int(1, 1440, 'Durée théorique'),
    lateToleranceMin: int(0, 240, 'Tolérance de retard'),
    earlyLeaveToleranceMin: int(0, 240, 'Tolérance de départ anticipé'),
    overtimeThresholdMin: int(0, 600, 'Seuil des heures sup.'),
    breakTracking: z.boolean(),
    maxBreaks: int(0, 10, 'Nombre de pauses'),
    arrivalWindowBeforeMin: int(0, 720, "Fenêtre d'arrivée"),
  })
  .refine((v) => (v.breakStart === '') === (v.breakEnd === ''), { path: ['breakEnd'], message: 'Renseignez le début et la fin de la pause, ou aucun des deux.' })
  .refine((v) => v.startTime !== v.endTime, { path: ['endTime'], message: "L'heure de fin doit différer de l'heure de début." });

export type VersionValues = z.infer<typeof versionSchema>;

export function versionDefaults(from?: Partial<ScheduleVersion> | null, effectiveFrom = todayISO()): VersionValues {
  return {
    effectiveFrom,
    startTime: from?.startTime ?? '08:00',
    endTime: from?.endTime ?? '17:00',
    breakStart: from?.breakStart ?? '12:00',
    breakEnd: from?.breakEnd ?? '13:00',
    workDays: from?.workDays ?? [1, 2, 3, 4, 5],
    dailyMinutes: from?.dailyMinutes ?? 480,
    lateToleranceMin: from?.lateToleranceMin ?? 10,
    earlyLeaveToleranceMin: from?.earlyLeaveToleranceMin ?? 0,
    overtimeThresholdMin: from?.overtimeThresholdMin ?? 15,
    breakTracking: from?.breakTracking ?? false,
    maxBreaks: from?.maxBreaks ?? 1,
    arrivalWindowBeforeMin: from?.arrivalWindowBeforeMin ?? 120,
  };
}

export function toVersionInput(v: VersionValues): ScheduleVersionInput {
  return { ...v, breakStart: v.breakStart || null, breakEnd: v.breakEnd || null };
}

export function useVersionForm(defaults: VersionValues) {
  return useForm<VersionValues>({ resolver: zodResolver(versionSchema), defaultValues: defaults });
}

/** Applique les erreurs 422 du serveur (champs éventuellement préfixés par « version. »). */
export function applyServerErrors(e: unknown, form: UseFormReturn<VersionValues>, prefix = '') {
  if (!isApiError(e) || e.status !== 422) return false;
  Object.entries(e.fieldErrors).forEach(([k, m]) => {
    const key = prefix && k.startsWith(prefix) ? k.slice(prefix.length) : k;
    form.setError(key as keyof VersionValues, { message: m });
  });
  return true;
}

/** Champs d'une version d'horaire (ScheduleVersionInput), organisés en sections. */
export function ScheduleVersionFields({ form, minEffectiveFrom, idPrefix = 'v' }: { form: UseFormReturn<VersionValues>; minEffectiveFrom?: string; idPrefix?: string }) {
  const { register, control, watch, setValue, formState: { errors } } = form;
  const [autoDuration, setAutoDuration] = React.useState(true);
  const [start, end, bStart, bEnd, breakTracking, daily] = watch(['startTime', 'endTime', 'breakStart', 'breakEnd', 'breakTracking', 'dailyMinutes']);
  const computed = computeDailyMinutes(start, end, bStart, bEnd);
  const night = isNightSchedule(start, end);

  React.useEffect(() => {
    if (autoDuration && computed !== null && computed > 0 && computed !== daily) setValue('dailyMinutes', computed, { shouldValidate: true });
  }, [autoDuration, computed, daily, setValue]);

  const id = (s: string) => `${idPrefix}-${s}`;
  const num = { valueAsNumber: true } as const;

  return (
    <div>
      <FormSection title="Prise d'effet" description="La version s'applique à partir de cette date. Les journées antérieures restent calculées avec la version précédente.">
        <FormField label="Date d'effet" htmlFor={id('from')} error={errors.effectiveFrom} required className="max-w-xs">
          <Controller control={control} name="effectiveFrom" render={({ field }) => (
            <DatePicker id={id('from')} value={field.value} onChange={field.onChange} min={minEffectiveFrom} aria-invalid={!!errors.effectiveFrom} />
          )} />
        </FormField>
      </FormSection>

      <FormSection
        title="Plage horaire"
        description="Heures de début et de fin de journée. Une heure de fin inférieure ou égale au début désigne un horaire de nuit."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Début" htmlFor={id('start')} error={errors.startTime} required>
            <Controller control={control} name="startTime" render={({ field }) => (
              <DatePicker type="time" id={id('start')} value={field.value} onChange={field.onChange} aria-invalid={!!errors.startTime} />
            )} />
          </FormField>
          <FormField label="Fin" htmlFor={id('end')} error={errors.endTime} required>
            <Controller control={control} name="endTime" render={({ field }) => (
              <DatePicker type="time" id={id('end')} value={field.value} onChange={field.onChange} aria-invalid={!!errors.endTime} />
            )} />
          </FormField>
          <FormField label="Début de pause" htmlFor={id('bs')} error={errors.breakStart} hint="Facultatif">
            <Controller control={control} name="breakStart" render={({ field }) => (
              <DatePicker type="time" id={id('bs')} value={field.value} onChange={field.onChange} aria-invalid={!!errors.breakStart} />
            )} />
          </FormField>
          <FormField label="Fin de pause" htmlFor={id('be')} error={errors.breakEnd} hint="Facultatif">
            <Controller control={control} name="breakEnd" render={({ field }) => (
              <DatePicker type="time" id={id('be')} value={field.value} onChange={field.onChange} aria-invalid={!!errors.breakEnd} />
            )} />
          </FormField>
        </div>
        {night && (
          <div className="flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-800">
            <Badge variant="info" className="shrink-0"><Moon className="h-3 w-3" />Traverse minuit</Badge>
            <span><strong>Horaire de nuit détecté</strong> : la journée commence la veille et se termine le lendemain. Elle est rattachée à la date de début.</span>
          </div>
        )}
      </FormSection>

      <FormSection title="Jours travaillés" description="Les autres jours sont considérés comme non travaillés (repos).">
        <Controller control={control} name="workDays" render={({ field }) => <WeekdayChips value={field.value} onChange={field.onChange} />} />
        {errors.workDays && <p className="text-xs font-medium text-danger" role="alert">{errors.workDays.message}</p>}
      </FormSection>

      <FormSection title="Durée théorique" description="Temps de travail attendu par jour, calculé automatiquement (amplitude moins la pause). Vous pouvez l'ajuster.">
        <div className="flex flex-wrap items-end gap-3">
          <FormField label="Durée journalière" htmlFor={id('daily')} error={errors.dailyMinutes} required className="w-48"
            hint={Number.isFinite(daily) ? formatDuration(daily) : undefined}>
            <NumberInput id={id('daily')} unit="min" min={1} max={1440}
              {...register('dailyMinutes', { ...num, onChange: () => setAutoDuration(false) })} aria-invalid={!!errors.dailyMinutes} />
          </FormField>
          {autoDuration ? (
            <Badge variant="success" className="mb-7">Calcul automatique</Badge>
          ) : (
            <Button type="button" variant="ghost" size="sm" className="mb-6" leftIcon={<RotateCcw />} onClick={() => setAutoDuration(true)} disabled={computed === null}>
              Recalculer ({computed !== null ? formatDuration(computed) : '—'})
            </Button>
          )}
        </div>
      </FormSection>

      <FormSection title="Tolérances et seuils" description="Un retard inférieur ou égal à la tolérance n'est pas compté. Les heures sup. potentielles ne sont signalées qu'au-delà du seuil.">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Tolérance de retard" htmlFor={id('late')} error={errors.lateToleranceMin}>
            <NumberInput id={id('late')} unit="min" min={0} {...register('lateToleranceMin', num)} aria-invalid={!!errors.lateToleranceMin} />
          </FormField>
          <FormField label="Tolérance de départ anticipé" htmlFor={id('early')} error={errors.earlyLeaveToleranceMin}>
            <NumberInput id={id('early')} unit="min" min={0} {...register('earlyLeaveToleranceMin', num)} aria-invalid={!!errors.earlyLeaveToleranceMin} />
          </FormField>
          <FormField label="Seuil des heures sup." htmlFor={id('ot')} error={errors.overtimeThresholdMin} hint="Minutes au-delà de la durée théorique">
            <NumberInput id={id('ot')} unit="min" min={0} {...register('overtimeThresholdMin', num)} aria-invalid={!!errors.overtimeThresholdMin} />
          </FormField>
          <FormField label="Fenêtre d'arrivée anticipée" htmlFor={id('win')} error={errors.arrivalWindowBeforeMin} hint="Arrivée acceptée jusqu'à X min avant le début">
            <NumberInput id={id('win')} unit="min" min={0} {...register('arrivalWindowBeforeMin', num)} aria-invalid={!!errors.arrivalWindowBeforeMin} />
          </FormField>
        </div>
      </FormSection>

      <FormSection title="Pauses pointées" description="Si activé, les employés scannent le début et la fin de chaque pause ; la durée réelle est déduite du temps de travail.">
        <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 p-3">
          <div>
            <Label htmlFor={id('bt')}>Pointer les pauses</Label>
            <p className="text-xs text-muted">Sinon, la pause théorique de l'horaire est appliquée.</p>
          </div>
          <Controller control={control} name="breakTracking" render={({ field }) => (
            <Switch id={id('bt')} checked={field.value} onCheckedChange={field.onChange} />
          )} />
        </div>
        {breakTracking && (
          <FormField label="Nombre maximal de pauses par jour" htmlFor={id('max')} error={errors.maxBreaks} className="w-56">
            <NumberInput id={id('max')} min={0} max={10} {...register('maxBreaks', num)} aria-invalid={!!errors.maxBreaks} />
          </FormField>
        )}
      </FormSection>
    </div>
  );
}

/** Résumé compact d'une version. */
export function VersionSummary({ v, compact }: { v: ScheduleVersion; compact?: boolean }) {
  const night = isNightSchedule(v.startTime, v.endTime);
  return (
    <div className={compact ? 'flex flex-wrap items-center gap-x-3 gap-y-1 text-sm' : 'flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm'}>
      <span className="font-semibold text-ink tabular">{v.startTime} – {v.endTime}</span>
      {night && <Badge variant="info"><Moon className="h-3 w-3" />Traverse minuit</Badge>}
      <span className="text-muted">{v.breakStart && v.breakEnd ? `Pause ${v.breakStart}–${v.breakEnd}` : 'Sans pause fixe'}</span>
      <span className="text-muted">{formatDuration(v.dailyMinutes)} / jour</span>
    </div>
  );
}
