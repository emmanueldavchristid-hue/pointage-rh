import * as React from 'react';
import { Controller, useFieldArray, useForm, type FieldValues, type UseFormReturn } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  AlertTriangle, Archive, Building2, Eye, Fingerprint, ImageUp, Lock, Percent, Plus, Save, ShieldCheck, Timer, Trash2, Undo2,
} from 'lucide-react';
import {
  Button, Card, CardContent, DatePicker, FormField, Input, Label, PageHeader, Select, Skeleton, Switch, Tabs, TabsContent,
  TabsList, TabsTrigger, Textarea,
} from '@/components/ui';
import { Callout, FormSection, LoadError, NumberInput } from '@/features/admin/shared';
import {
  useCompanySettings, useSystemSettings, useUpdateCompanySettings, useUpdateSystemSection, useUploadLogo,
  type CompanySettings, type SystemSection, type SystemSettings,
} from '@/features/settings/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { assetUrl, isApiError } from '@/lib/api';
import { formatDuration } from '@/lib/format';
import { cn } from '@/lib/utils';

const TABS = [
  { value: 'company', label: 'Entreprise', icon: Building2 },
  { value: 'clocking', label: 'Pointage', icon: Fingerprint },
  { value: 'security', label: 'Sécurité', icon: Lock },
  { value: 'overtime', label: 'Heures sup.', icon: Timer },
  { value: 'anomalies', label: 'Anomalies', icon: AlertTriangle },
  { value: 'retention', label: 'Conservation', icon: ShieldCheck },
  { value: 'backup', label: 'Sauvegarde', icon: Archive },
] as const;

export default function AdminSettingsPage() {
  const { hasRole } = useAuth();
  const readOnly = !hasRole('SUPER_ADMIN');
  const [tab, setTab] = React.useState<string>('company');
  const system = useSystemSettings();

  return (
    <div>
      <PageHeader title="Paramètres" description="Configuration de l'entreprise, du pointage, de la sécurité et de la conservation des données." />
      {readOnly && (
        <Callout icon={Eye} tone="neutral" className="mb-6">Consultation seule : seul le super administrateur peut modifier ces paramètres.</Callout>
      )}
      <Tabs value={tab} onValueChange={setTab} orientation="vertical" className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <TabsList className="h-auto w-full flex-row flex-nowrap items-stretch justify-start gap-1 overflow-x-auto bg-transparent p-0 lg:flex-col">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}
              className="h-10 justify-start gap-2.5 rounded-lg px-3 data-[state=active]:bg-white data-[state=active]:text-brand-700 data-[state=active]:shadow-card lg:w-full">
              <t.icon />{t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <div className="min-w-0">
          <TabsContent value="company" className="mt-0"><CompanyTab readOnly={readOnly} /></TabsContent>
          {TABS.filter((t) => t.value !== 'company').map((t) => (
            <TabsContent key={t.value} value={t.value} className="mt-0">
              {system.isPending ? (
                <Card><CardContent className="space-y-4"><Skeleton className="h-6 w-48" /><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></CardContent></Card>
              ) : system.isError ? (
                <Card><LoadError error={system.error} onRetry={system.refetch} /></Card>
              ) : (
                <SystemTab section={t.value as SystemSection} data={system.data} readOnly={readOnly} />
              )}
            </TabsContent>
          ))}
        </div>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Barre d'enregistrement commune
// ---------------------------------------------------------------------------

function SaveBar<T extends FieldValues>({ form, loading, readOnly }: { form: UseFormReturn<T>; loading: boolean; readOnly: boolean }) {
  if (readOnly) return null;
  const dirty = form.formState.isDirty;
  return (
    <div className="sticky bottom-0 -mx-5 -mb-5 mt-6 flex items-center justify-end gap-2 rounded-b-xl border-t border-slate-100 bg-white/95 px-5 py-3 backdrop-blur">
      {dirty && <span className="mr-auto text-xs font-medium text-warning-strong">Modifications non enregistrées</span>}
      <Button type="button" variant="ghost" disabled={!dirty || loading} leftIcon={<Undo2 />} onClick={() => form.reset()}>Annuler</Button>
      <Button type="submit" disabled={!dirty} loading={loading} leftIcon={<Save />}>Enregistrer</Button>
    </div>
  );
}

function applyErrors<T extends FieldValues>(e: unknown, form: UseFormReturn<T>, prefix = '') {
  if (!isApiError(e) || e.status !== 422) return;
  Object.entries(e.fieldErrors).forEach(([k, m]) => {
    const key = prefix && k.startsWith(prefix) ? k.slice(prefix.length) : k;
    form.setError(key as never, { message: m });
  });
}

// ---------------------------------------------------------------------------
// Entreprise
// ---------------------------------------------------------------------------

const timeOpt = z.union([z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Heure invalide.'), z.literal('')]);
const companySchema = z.object({
  name: z.string().trim().min(2, 'Nom trop court.').max(120, 'Nom trop long.'),
  address: z.string().max(240, 'Adresse trop longue.'),
  phone: z.string().max(40, 'Numéro trop long.'),
  email: z.union([z.email('Adresse e-mail invalide.'), z.literal('')]),
  timezone: z.string().min(1, 'Fuseau requis.'),
  currency: z.string().min(3, 'Devise requise.'),
  openingTime: timeOpt,
  closingTime: timeOpt,
});
type CompanyValues = z.infer<typeof companySchema>;

const TIMEZONES = ['Africa/Abidjan', 'Africa/Accra', 'Africa/Dakar', 'Africa/Bamako', 'Africa/Ouagadougou', 'Africa/Lome', 'Africa/Porto-Novo', 'Africa/Lagos', 'Africa/Douala', 'Africa/Libreville', 'Europe/Paris', 'UTC'];
const CURRENCIES = [{ value: 'XOF', label: 'XOF — Franc CFA (UEMOA)' }, { value: 'XAF', label: 'XAF — Franc CFA (CEMAC)' }, { value: 'EUR', label: 'EUR — Euro' }, { value: 'USD', label: 'USD — Dollar US' }, { value: 'GHS', label: 'GHS — Cedi' }, { value: 'NGN', label: 'NGN — Naira' }];

const companyValues = (c: CompanySettings): CompanyValues => ({
  name: c.name ?? '', address: c.address ?? '', phone: c.phone ?? '', email: c.email ?? '',
  timezone: c.timezone ?? 'Africa/Abidjan', currency: c.currency ?? 'XOF', openingTime: c.openingTime ?? '', closingTime: c.closingTime ?? '',
});

function CompanyTab({ readOnly }: { readOnly: boolean }) {
  const q = useCompanySettings();
  if (q.isPending) return <Card><CardContent className="space-y-4"><Skeleton className="h-20 w-full" /><Skeleton className="h-40 w-full" /></CardContent></Card>;
  if (q.isError) return <Card><LoadError error={q.error} onRetry={q.refetch} /></Card>;
  return <CompanyForm data={q.data} readOnly={readOnly} />;
}

function CompanyForm({ data, readOnly }: { data: CompanySettings; readOnly: boolean }) {
  const update = useUpdateCompanySettings();
  const upload = useUploadLogo();
  const { company } = useAuth();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = React.useState<string | null>(null);
  const form = useForm<CompanyValues>({ resolver: zodResolver(companySchema), defaultValues: companyValues(data) });
  React.useEffect(() => { form.reset(companyValues(data)); }, [data]); // eslint-disable-line react-hooks/exhaustive-deps
  const { register, control, handleSubmit, formState: { errors } } = form;
  const logo = assetUrl(data.logoUrl ?? data.logoPath ?? company?.logoUrl);
  const tzOptions = (TIMEZONES.includes(data.timezone) ? TIMEZONES : [data.timezone, ...TIMEZONES]).map((t) => ({ value: t, label: t }));
  const curOptions = CURRENCIES.some((c) => c.value === data.currency) ? CURRENCIES : [{ value: data.currency, label: data.currency }, ...CURRENCIES];

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!['image/png', 'image/jpeg', 'image/svg+xml'].includes(f.type)) return setFileError('Format accepté : PNG, JPG ou SVG.');
    if (f.size > 2 * 1024 * 1024) return setFileError('Fichier trop volumineux (2 Mo maximum).');
    setFileError(null);
    upload.mutate(f);
  }

  async function onSubmit(v: CompanyValues) {
    try {
      await update.mutateAsync({
        name: v.name.trim(), timezone: v.timezone, currency: v.currency,
        address: v.address.trim() || undefined, phone: v.phone.trim() || undefined, email: v.email.trim() || undefined,
        openingTime: v.openingTime || undefined, closingTime: v.closingTime || undefined,
      });
    } catch (e) { applyErrors(e, form); }
  }

  return (
    <Card>
      <form noValidate onSubmit={handleSubmit(onSubmit)}>
        <CardContent>
          <fieldset disabled={readOnly} className="contents">
            <FormSection title="Logo" description="Affiché dans l'application, sur la borne et les exports PDF. PNG, JPG ou SVG, 2 Mo maximum.">
              <div className="flex items-center gap-4">
                <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                  {logo ? <img src={logo} alt="Logo de l'entreprise" className="h-full w-full object-contain p-1.5" /> : <Building2 className="h-7 w-7 text-slate-300" />}
                </div>
                {!readOnly && (
                  <div className="space-y-1">
                    <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml" className="hidden" onChange={onFile} />
                    <Button type="button" variant="outline" size="sm" leftIcon={<ImageUp />} loading={upload.isPending} onClick={() => fileRef.current?.click()}>
                      {logo ? 'Remplacer le logo' : 'Téléverser un logo'}
                    </Button>
                    {fileError && <p className="text-xs font-medium text-danger" role="alert">{fileError}</p>}
                  </div>
                )}
              </div>
            </FormSection>
            <FormSection title="Identité" description="Raison sociale et coordonnées affichées sur les documents.">
              <FormField label="Nom de l'entreprise" htmlFor="c-name" error={errors.name} required>
                <Input id="c-name" {...register('name')} aria-invalid={!!errors.name} />
              </FormField>
              <FormField label="Adresse" htmlFor="c-addr" error={errors.address}>
                <Textarea id="c-addr" rows={2} {...register('address')} />
              </FormField>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Téléphone" htmlFor="c-phone" error={errors.phone}><Input id="c-phone" type="tel" {...register('phone')} /></FormField>
                <FormField label="E-mail" htmlFor="c-email" error={errors.email}><Input id="c-email" type="email" {...register('email')} aria-invalid={!!errors.email} /></FormField>
              </div>
            </FormSection>
            <FormSection title="Région et horaires d'ouverture" description="Le fuseau horaire détermine l'affichage de toutes les heures et le découpage des journées.">
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Fuseau horaire" htmlFor="c-tz" error={errors.timezone} required>
                  <Controller control={control} name="timezone" render={({ field }) => <Select id="c-tz" value={field.value} onValueChange={field.onChange} options={tzOptions} disabled={readOnly} />} />
                </FormField>
                <FormField label="Devise" htmlFor="c-cur" error={errors.currency} required>
                  <Controller control={control} name="currency" render={({ field }) => <Select id="c-cur" value={field.value} onValueChange={field.onChange} options={curOptions} disabled={readOnly} />} />
                </FormField>
                <FormField label="Ouverture" htmlFor="c-open" error={errors.openingTime}>
                  <Controller control={control} name="openingTime" render={({ field }) => <DatePicker type="time" id="c-open" value={field.value} onChange={field.onChange} />} />
                </FormField>
                <FormField label="Fermeture" htmlFor="c-close" error={errors.closingTime}>
                  <Controller control={control} name="closingTime" render={({ field }) => <DatePicker type="time" id="c-close" value={field.value} onChange={field.onChange} />} />
                </FormField>
              </div>
            </FormSection>
          </fieldset>
          <SaveBar form={form} loading={update.isPending} readOnly={readOnly} />
        </CardContent>
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Paramètres système (une section = un formulaire)
// ---------------------------------------------------------------------------

const n = (min: number, max: number) => z.number({ error: 'Nombre requis.' }).int('Nombre entier attendu.').min(min, `Minimum ${min}.`).max(max, `Maximum ${max}.`);
const CIDR = /^(((25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(25[0-5]|2[0-4]\d|1?\d?\d)\/(3[0-2]|[12]?\d)|[0-9a-fA-F:]+:[0-9a-fA-F:]*\/(12[0-8]|1[01]\d|[1-9]?\d))$/;

const schemas = {
  clocking: z.object({
    networksText: z.string().refine((t) => t.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean).every((s) => CIDR.test(s)), 'Une ou plusieurs plages sont invalides (format CIDR attendu, ex. 192.168.1.0/24).'),
    enforceNetwork: z.boolean(),
    maxAttemptsPerMinute: n(1, 120),
    repeatedRefusalThreshold: n(1, 100),
    dayCloseGraceMinutes: n(0, 1440),
  }),
  security: z.object({ sessionHours: n(1, 168), maxLoginAttempts: n(1, 50), lockMinutes: n(1, 1440) }),
  overtime: z.object({
    requireValidation: z.boolean(),
    rates: z.array(z.object({
      code: z.string().trim().min(1, 'Code requis.').max(20, 'Code trop long.'),
      label: z.string().trim().min(2, 'Libellé requis.').max(80, 'Libellé trop long.'),
      percent: z.number({ error: 'Pourcentage requis.' }).min(0, 'Minimum 0 %.').max(500, 'Maximum 500 %.'),
    })).refine((r) => new Set(r.map((x) => x.code.trim().toUpperCase())).size === r.length, 'Chaque code de taux doit être unique.'),
  }),
  anomalies: z.object({ maxWorkMinutes: n(60, 1440), offHoursMarginMin: n(0, 720) }),
  retention: z.object({ auditDays: n(30, 7300), attendanceYears: n(1, 30) }),
  backup: z.object({
    enabled: z.boolean(),
    cron: z.string().trim().regex(/^(\S+\s+){4}\S+$/, 'Expression cron à 5 champs attendue (minute heure jour mois jour-semaine).'),
    keep: n(1, 365),
  }),
};

function toForm(section: SystemSection, d: SystemSettings): Record<string, unknown> {
  if (section === 'clocking') {
    const c = d.clocking;
    return { networksText: (c.allowedNetworks ?? []).join('\n'), enforceNetwork: !!c.enforceNetwork, maxAttemptsPerMinute: c.maxAttemptsPerMinute, repeatedRefusalThreshold: c.repeatedRefusalThreshold, dayCloseGraceMinutes: c.dayCloseGraceMinutes ?? 120 };
  }
  return JSON.parse(JSON.stringify(d[section] ?? {}));
}
function fromForm(section: SystemSection, v: Record<string, unknown>, d: SystemSettings): SystemSettings[SystemSection] {
  if (section === 'clocking') {
    const { networksText, ...rest } = v as { networksText: string } & Record<string, unknown>;
    return { ...d.clocking, ...rest, allowedNetworks: networksText.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean) } as SystemSettings['clocking'];
  }
  if (section === 'overtime') {
    const o = v as SystemSettings['overtime'];
    return { ...o, rates: o.rates.map((r) => ({ code: r.code.trim().toUpperCase(), label: r.label.trim(), percent: r.percent })) };
  }
  if (section === 'backup') return { ...(v as SystemSettings['backup']), cron: String(v.cron).trim() };
  return { ...(d[section] as object), ...v } as SystemSettings[SystemSection];
}

function SystemTab({ section, data, readOnly }: { section: SystemSection; data: SystemSettings; readOnly: boolean }) {
  const update = useUpdateSystemSection();
  const form = useForm<Record<string, unknown>>({ resolver: zodResolver(schemas[section] as never), defaultValues: toForm(section, data) });
  React.useEffect(() => { form.reset(toForm(section, data)); }, [data, section]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onSubmit(v: Record<string, unknown>) {
    try {
      await update.mutateAsync({ section, value: fromForm(section, v, data) });
    } catch (e) { applyErrors(e, form, `${section}.`); }
  }

  const Body = { clocking: ClockingFields, security: SecurityFields, overtime: OvertimeFields, anomalies: AnomaliesFields, retention: RetentionFields, backup: BackupFields }[section];
  return (
    <Card>
      <form noValidate onSubmit={form.handleSubmit(onSubmit)}>
        <CardContent>
          <fieldset disabled={readOnly} className="contents">
            <Body form={form} readOnly={readOnly} />
          </fieldset>
          <SaveBar form={form} loading={update.isPending} readOnly={readOnly} />
        </CardContent>
      </form>
    </Card>
  );
}

type F = { form: UseFormReturn<Record<string, unknown>>; readOnly: boolean };
const errOf = (form: F['form'], name: string) => {
  const parts = name.split('.');
  let cur: unknown = form.formState.errors;
  for (const p of parts) cur = (cur as Record<string, unknown> | undefined)?.[p];
  return (cur as { message?: string } | undefined)?.message;
};

function NumField({ form, name, label, unit, hint, min }: F & { name: string; label: string; unit?: string; hint?: React.ReactNode; min?: number }) {
  const err = errOf(form, name);
  return (
    <FormField label={label} htmlFor={`sys-${name}`} error={err} hint={hint}>
      <NumberInput id={`sys-${name}`} unit={unit} min={min} {...form.register(name, { valueAsNumber: true })} aria-invalid={!!err} />
    </FormField>
  );
}

function SwitchRow({ form, name, label, description, readOnly }: F & { name: string; label: string; description: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-slate-200 p-4">
      <div>
        <Label htmlFor={`sys-${name}`}>{label}</Label>
        <p className="mt-0.5 text-xs leading-relaxed text-muted">{description}</p>
      </div>
      <Controller control={form.control} name={name} render={({ field }) => (
        <Switch id={`sys-${name}`} checked={!!field.value} onCheckedChange={field.onChange} disabled={readOnly} />
      )} />
    </div>
  );
}

function ClockingFields(p: F) {
  const enforce = p.form.watch('enforceNetwork');
  const err = errOf(p.form, 'networksText');
  return (
    <>
      <FormSection title="Restriction réseau" description="Limite le pointage aux appareils connectés au réseau de l'entreprise (Wi-Fi interne).">
        <SwitchRow {...p} name="enforceNetwork" label="Exiger le réseau de l'entreprise" description="Les scans provenant d'une autre adresse IP sont refusés et tracés." />
        {!enforce && <Callout tone="warning">Sans restriction réseau, un QR photographié peut être scanné depuis n'importe où (surtout en mode statique).</Callout>}
        <FormField label="Plages réseau autorisées (CIDR)" htmlFor="sys-networks" error={err} hint="Une plage par ligne, ex. 192.168.1.0/24 ou 10.0.0.0/8.">
          <Textarea id="sys-networks" rows={6} className="font-mono text-[13px]" {...p.form.register('networksText')} aria-invalid={!!err} />
        </FormField>
      </FormSection>
      <FormSection title="Protection contre les abus" description="Limites appliquées par employé et par appareil.">
        <div className="grid gap-4 sm:grid-cols-2">
          <NumField {...p} name="maxAttemptsPerMinute" label="Tentatives de scan par minute" min={1} hint="Au-delà, les scans sont temporairement bloqués." />
          <NumField {...p} name="repeatedRefusalThreshold" label="Seuil de refus répétés" min={1} hint="Nombre de refus déclenchant une anomalie." />
        </div>
      </FormSection>
      <FormSection title="Clôture des journées" description="Délai après la fin théorique avant de clôturer une journée et de signaler les départs manquants.">
        <div className="max-w-xs"><NumField {...p} name="dayCloseGraceMinutes" label="Délai de grâce" unit="min" min={0} /></div>
      </FormSection>
    </>
  );
}

function SecurityFields(p: F) {
  const hours = p.form.watch('sessionHours') as number;
  return (
    <>
      <FormSection title="Sessions" description="Durée maximale d'une session avant reconnexion obligatoire.">
        <div className="max-w-xs"><NumField {...p} name="sessionHours" label="Durée de session" unit="h" min={1} hint={Number.isFinite(hours) ? `Soit ${formatDuration(hours * 60)}` : undefined} /></div>
      </FormSection>
      <FormSection title="Verrouillage des comptes" description="Protège contre les tentatives de devinette de mot de passe.">
        <div className="grid gap-4 sm:grid-cols-2">
          <NumField {...p} name="maxLoginAttempts" label="Tentatives de connexion" min={1} hint="Échecs consécutifs avant verrouillage." />
          <NumField {...p} name="lockMinutes" label="Durée du verrouillage" unit="min" min={1} />
        </div>
      </FormSection>
    </>
  );
}

function OvertimeFields(p: F) {
  const { fields, append, remove } = useFieldArray({ control: p.form.control, name: 'rates' as never });
  const ratesErr = (p.form.formState.errors.rates as { message?: string; root?: { message?: string } } | undefined);
  return (
    <>
      <FormSection title="Validation" description="Les heures sup. sont calculées comme « potentielles » à partir des pointages.">
        <SwitchRow {...p} name="requireValidation" label="Validation obligatoire par un responsable ou la RH"
          description="Recommandé : la présence sur site ne prouve pas un travail effectif. Aucune heure sup. n'est alors payée sans décision explicite." />
      </FormSection>
      <FormSection title="Taux de majoration" description="Taux proposés lors de la validation. Aucun taux n'est fourni par défaut.">
        <Callout tone="warning" icon={Percent}>
          Les taux sont à définir selon la convention collective applicable et le droit du travail ivoirien (heures de jour, de nuit,
          dimanche, jours fériés…). Faites-les valider par votre service juridique ou paie.
        </Callout>
        {fields.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-muted">Aucun taux paramétré.</div>
        ) : (
          <div className="space-y-3">
            <div className="hidden grid-cols-[120px_1fr_140px_40px] gap-3 px-1 text-xs font-medium uppercase tracking-wide text-muted sm:grid">
              <span>Code</span><span>Libellé</span><span>Majoration</span><span />
            </div>
            {fields.map((f, i) => {
              const e = (k: string) => errOf(p.form, `rates.${i}.${k}`);
              return (
                <div key={f.id} className="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-[120px_1fr_140px_40px] sm:items-start sm:gap-3 sm:border-0 sm:p-0">
                  <div>
                    <Input aria-label={`Code du taux ${i + 1}`} placeholder="Code" className="font-mono uppercase" {...p.form.register(`rates.${i}.code`)} aria-invalid={!!e('code')} />
                    {e('code') && <p className="mt-1 text-xs text-danger">{e('code')}</p>}
                  </div>
                  <div>
                    <Input aria-label={`Libellé du taux ${i + 1}`} placeholder="Libellé" {...p.form.register(`rates.${i}.label`)} aria-invalid={!!e('label')} />
                    {e('label') && <p className="mt-1 text-xs text-danger">{e('label')}</p>}
                  </div>
                  <div>
                    <NumberInput aria-label={`Pourcentage du taux ${i + 1}`} unit="%" step="0.5" min={0} {...p.form.register(`rates.${i}.percent`, { valueAsNumber: true })} aria-invalid={!!e('percent')} />
                    {e('percent') && <p className="mt-1 text-xs text-danger">{e('percent')}</p>}
                  </div>
                  {!p.readOnly && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => remove(i)} aria-label={`Supprimer le taux ${i + 1}`}><Trash2 className="text-slate-500" /></Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {(ratesErr?.message || ratesErr?.root?.message) && <p className="text-xs font-medium text-danger" role="alert">{ratesErr?.message ?? ratesErr?.root?.message}</p>}
        {!p.readOnly && (
          <Button type="button" variant="outline" size="sm" leftIcon={<Plus />} onClick={() => append({ code: '', label: '', percent: NaN } as never)}>Ajouter un taux</Button>
        )}
      </FormSection>
    </>
  );
}

function AnomaliesFields(p: F) {
  const max = p.form.watch('maxWorkMinutes') as number;
  return (
    <FormSection title="Seuils de détection" description="Paramètres utilisés par la détection automatique des anomalies.">
      <div className="grid gap-4 sm:grid-cols-2">
        <NumField {...p} name="maxWorkMinutes" label="Durée de travail anormale" unit="min" min={60} hint={Number.isFinite(max) ? `Signalée au-delà de ${formatDuration(max)} par jour.` : undefined} />
        <NumField {...p} name="offHoursMarginMin" label="Marge hors horaire" unit="min" min={0} hint="Un pointage plus éloigné que cette marge des heures prévues est « hors horaire »." />
      </div>
    </FormSection>
  );
}

function RetentionFields(p: F) {
  const days = p.form.watch('auditDays') as number;
  return (
    <>
      <FormSection title="Durées de conservation" description="Au-delà, les données sont purgées automatiquement.">
        <div className="grid gap-4 sm:grid-cols-2">
          <NumField {...p} name="auditDays" label="Journal d'audit" unit="jours" min={30} hint={Number.isFinite(days) ? `≈ ${(days / 365).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} an(s)` : undefined} />
          <NumField {...p} name="attendanceYears" label="Données de présence" unit="ans" min={1} />
        </div>
        <Callout tone="neutral">Vérifiez ces durées au regard des obligations légales (Code du travail, loi ivoirienne sur la protection des données personnelles).</Callout>
      </FormSection>
    </>
  );
}

function describeCron(c: string): string | null {
  const m = /^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+(\*|[0-7](?:-[0-7])?(?:,[0-7])*)$/.exec(c.trim());
  if (!m) return null;
  const t = `${m[2].padStart(2, '0')}:${m[1].padStart(2, '0')}`;
  if (m[3] === '*') return `Tous les jours à ${t}`;
  if (m[3] === '1-5') return `Du lundi au vendredi à ${t}`;
  return `À ${t} (jours : ${m[3]})`;
}

function BackupFields(p: F) {
  const cron = String(p.form.watch('cron') ?? '');
  const desc = describeCron(cron);
  const err = errOf(p.form, 'cron');
  return (
    <>
      <FormSection title="Sauvegarde automatique" description="Copie complète de la base de données sur le serveur.">
        <SwitchRow {...p} name="enabled" label="Activer la sauvegarde automatique" description="Recommandé. Copiez aussi régulièrement les sauvegardes hors du serveur." />
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Planification (cron)" htmlFor="sys-cron" error={err} hint={desc ?? 'Format : minute heure jour mois jour-semaine (ex. 30 23 * * *).'}>
            <Input id="sys-cron" className={cn('font-mono')} {...p.form.register('cron')} aria-invalid={!!err} />
          </FormField>
          <NumField {...p} name="keep" label="Sauvegardes conservées" min={1} hint="Les plus anciennes sont supprimées automatiquement." />
        </div>
      </FormSection>
    </>
  );
}
