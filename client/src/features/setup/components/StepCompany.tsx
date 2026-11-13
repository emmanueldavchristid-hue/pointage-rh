import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { ArrowRight, Building2, ImageUp } from 'lucide-react';
import { Button, DatePicker, FormField, Input, Select, Skeleton } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { QueryError } from '@/features/employee/components/QueryError';
import { assetUrl, errorMessage, isApiError } from '@/lib/api';
import { useCompanySettings, useSaveCompany, useUploadLogo } from '../api';
import { BackButton, SectionTitle, StepShell } from './StepShell';

const TIMEZONES = [
  { value: 'Africa/Abidjan', label: 'Africa/Abidjan (GMT, Côte d\'Ivoire)' },
  { value: 'Africa/Dakar', label: 'Africa/Dakar (GMT)' },
  { value: 'Africa/Accra', label: 'Africa/Accra (GMT)' },
  { value: 'Africa/Lagos', label: 'Africa/Lagos (GMT+1)' },
  { value: 'Africa/Douala', label: 'Africa/Douala (GMT+1)' },
  { value: 'Europe/Paris', label: 'Europe/Paris' },
  { value: 'UTC', label: 'UTC' },
];
const CURRENCIES = [
  { value: 'XOF', label: 'XOF : franc CFA (BCEAO)' },
  { value: 'XAF', label: 'XAF : franc CFA (BEAC)' },
  { value: 'GHS', label: 'GHS : cedi' },
  { value: 'NGN', label: 'NGN : naira' },
  { value: 'EUR', label: 'EUR : euro' },
  { value: 'USD', label: 'USD : dollar US' },
];

const time = z.string().regex(/^(\d{2}:\d{2})?$/, 'Heure invalide (HH:MM).');
const schema = z.object({
  name: z.string().trim().min(2, "Indiquez le nom de l'établissement."),
  address: z.string().trim().max(300).optional(),
  phone: z.string().trim().max(40).optional(),
  email: z.union([z.literal(''), z.string().trim().email('Adresse e-mail invalide.')]).optional(),
  timezone: z.string().min(1, 'Choisissez un fuseau horaire.'),
  currency: z.string().min(1, 'Choisissez une devise.'),
  openingTime: time.optional(),
  closingTime: time.optional(),
}).refine((v) => !v.openingTime || !v.closingTime || v.closingTime > v.openingTime, { path: ['closingTime'], message: "L'heure de fermeture doit suivre l'heure d'ouverture." });
type Values = z.infer<typeof schema>;

export function StepCompany({ onDone, onBack }: { onDone: () => void; onBack?: () => void }) {
  const q = useCompanySettings();
  const save = useSaveCompany();
  const upload = useUploadLogo();
  const { company, refresh } = useAuth();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const { register, control, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', address: '', phone: '', email: '', timezone: 'Africa/Abidjan', currency: 'XOF', openingTime: '', closingTime: '' },
  });

  React.useEffect(() => {
    const c = q.data;
    if (!c) return;
    reset({
      name: c.name ?? '', address: c.address ?? '', phone: c.phone ?? '', email: c.email ?? '',
      timezone: c.timezone || 'Africa/Abidjan', currency: c.currency || 'XOF',
      openingTime: c.openingTime ?? '', closingTime: c.closingTime ?? '',
    });
  }, [q.data, reset]);

  const onSubmit = handleSubmit(async (v) => {
    try {
      await save.mutateAsync({
        name: v.name.trim(),
        address: v.address?.trim() || undefined,
        phone: v.phone?.trim() || undefined,
        email: v.email?.trim() || undefined,
        timezone: v.timezone,
        currency: v.currency,
        openingTime: v.openingTime || undefined,
        closingTime: v.closingTime || undefined,
      });
      await refresh();
      toast.success('Établissement enregistré.');
      onDone();
    } catch (e) {
      if (isApiError(e) && e.status === 422) Object.entries(e.fieldErrors).forEach(([k, m]) => setError(k as keyof Values, { message: m }));
      else toast.error(errorMessage(e));
    }
  });

  const onLogo = async (file?: File) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|svg\+xml)$/.test(file.type)) return toast.error('Format non accepté : PNG, JPG ou SVG.');
    if (file.size > 2 * 1024 * 1024) return toast.error('Logo trop volumineux : 2 Mo maximum.');
    await upload.mutateAsync(file).catch(() => undefined);
    await refresh();
  };

  const logo = assetUrl(company?.logoUrl ?? q.data?.logoUrl);

  return (
    <form onSubmit={onSubmit} noValidate>
      <StepShell
        title="Établissement"
        description="Ces informations apparaissent sur les bornes, les rapports et les exports."
        footer={<><BackButton onClick={onBack} /><Button type="submit" size="lg" rightIcon={<ArrowRight />} loading={isSubmitting}>Enregistrer et continuer</Button></>}
      >
        {q.isPending ? (
          <div className="space-y-3"><Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10" /></div>
        ) : q.isError ? (
          <QueryError error={q.error} onRetry={q.refetch} />
        ) : (
          <div className="space-y-6">
            <div className="flex items-center gap-4 rounded-xl border border-slate-200 p-4">
              <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                {logo ? <img src={logo} alt="Logo de l'établissement" className="h-full w-full object-contain p-1" /> : <Building2 className="h-7 w-7 text-slate-400" aria-hidden />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">Logo</p>
                <p className="text-xs text-muted">PNG, JPG ou SVG, 2 Mo maximum. Affiché sur les bornes et les documents.</p>
              </div>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml" className="sr-only" aria-label="Choisir un logo" onChange={(e) => { void onLogo(e.target.files?.[0]); e.target.value = ''; }} />
              <Button variant="outline" leftIcon={<ImageUp />} loading={upload.isPending} onClick={() => fileRef.current?.click()}>
                {logo ? 'Remplacer' : 'Ajouter'}
              </Button>
            </div>

            <div>
              <SectionTitle>Coordonnées</SectionTitle>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Nom de l'établissement" htmlFor="name" error={errors.name} required className="sm:col-span-2">
                  <Input id="name" {...register('name')} aria-invalid={!!errors.name} />
                </FormField>
                <FormField label="Adresse" htmlFor="address" error={errors.address} className="sm:col-span-2">
                  <Input id="address" placeholder="Quartier, commune, ville" {...register('address')} />
                </FormField>
                <FormField label="Téléphone" htmlFor="phone" error={errors.phone}>
                  <Input id="phone" type="tel" inputMode="tel" placeholder="+225 …" {...register('phone')} />
                </FormField>
                <FormField label="E-mail" htmlFor="email" error={errors.email}>
                  <Input id="email" type="email" {...register('email')} aria-invalid={!!errors.email} />
                </FormField>
              </div>
            </div>

            <div>
              <SectionTitle>Réglages régionaux et horaires d'ouverture</SectionTitle>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Fuseau horaire" htmlFor="timezone" error={errors.timezone} required hint="Toutes les heures de pointage sont calculées dans ce fuseau.">
                  <Controller control={control} name="timezone" render={({ field }) => (
                    <Select id="timezone" value={field.value} onValueChange={field.onChange} options={TIMEZONES.some((t) => t.value === field.value) ? TIMEZONES : [...TIMEZONES, { value: field.value, label: field.value }]} />
                  )} />
                </FormField>
                <FormField label="Devise" htmlFor="currency" error={errors.currency} required>
                  <Controller control={control} name="currency" render={({ field }) => (
                    <Select id="currency" value={field.value} onValueChange={field.onChange} options={CURRENCIES.some((c) => c.value === field.value) ? CURRENCIES : [...CURRENCIES, { value: field.value, label: field.value }]} />
                  )} />
                </FormField>
                <FormField label="Ouverture" htmlFor="openingTime" error={errors.openingTime}>
                  <Controller control={control} name="openingTime" render={({ field }) => <DatePicker id="openingTime" type="time" value={field.value} onChange={field.onChange} />} />
                </FormField>
                <FormField label="Fermeture" htmlFor="closingTime" error={errors.closingTime}>
                  <Controller control={control} name="closingTime" render={({ field }) => <DatePicker id="closingTime" type="time" value={field.value} onChange={field.onChange} />} />
                </FormField>
              </div>
            </div>
          </div>
        )}
      </StepShell>
    </form>
  );
}
