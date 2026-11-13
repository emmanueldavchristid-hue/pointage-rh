import * as React from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Clock3, Lock, QrCode, ShieldCheck, User, WifiOff } from 'lucide-react';
import { Button, FormField, Input, PageLoader } from '@/components/ui';
import { BrandMark } from '@/components/layout/BrandMark';
import { getCachedBrand, homePathFor, useAuth } from '@/features/auth/AuthProvider';
import { authKeys, fetchMe, useLogin } from '@/features/auth/api';
import { PasswordInput } from '@/features/auth/ChangePasswordForm';
import { ApiError } from '@/lib/api';
import { formatDateLong, formatTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { MeResponse } from '@/lib/types';

const schema = z.object({
  login: z.string().trim().min(1, 'Saisissez votre matricule ou votre email.'),
  password: z.string().min(1, 'Saisissez votre mot de passe.'),
});
type Values = z.infer<typeof schema>;

function useNow(intervalMs = 15_000) {
  const [now, setNow] = React.useState(() => new Date());
  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

const FEATURES = [
  { icon: QrCode, title: 'Pointage par QR Code', text: 'Arrivées, pauses et départs enregistrés en quelques secondes.' },
  { icon: Clock3, title: 'Temps de travail fiable', text: 'Retards, absences et heures supplémentaires calculés automatiquement.' },
  { icon: ShieldCheck, title: 'Données maîtrisées', text: 'Application hébergée sur le réseau de votre entreprise.' },
];

function BrandPanel({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  const now = useNow();
  return (
    <aside className="relative hidden overflow-hidden bg-ink text-white lg:flex lg:w-[46%] lg:flex-col xl:w-1/2">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage: 'linear-gradient(rgba(255,255,255,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
          maskImage: 'radial-gradient(ellipse at 30% 40%, black 30%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse at 30% 40%, black 30%, transparent 75%)',
        }}
      />
      <div aria-hidden className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-brand/25 blur-3xl" />
      <div className="relative flex flex-1 flex-col justify-between p-10 xl:p-14">
        <div className="flex items-center gap-3">
          <BrandMark logoUrl={logoUrl} name={name} inverted className="h-10 w-10" />
          <span className="text-lg font-semibold tracking-tight">{name}</span>
        </div>

        <div className="max-w-md">
          <h2 className="text-3xl font-semibold leading-tight tracking-tight xl:text-[34px]">
            Le temps de travail de vos équipes, clair et sans contestation.
          </h2>
          <ul className="mt-10 space-y-6">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/5 ring-1 ring-white/10">
                  <f.icon className="h-5 w-5 text-brand-500" />
                </span>
                <span>
                  <span className="block text-sm font-semibold">{f.title}</span>
                  <span className="mt-0.5 block text-sm leading-relaxed text-slate-400">{f.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-end justify-between border-t border-white/10 pt-6 text-sm">
          <div>
            <p className="text-3xl font-semibold tabular">{formatTime(now)}</p>
            <p className="mt-1 text-slate-400">{formatDateLong(now)}</p>
          </div>
          <p className="text-slate-500">Pointage RH</p>
        </div>
      </div>
    </aside>
  );
}

export default function LoginPage() {
  const { user, company, isLoading, error: meError } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const login = useLogin();
  const [formError, setFormError] = React.useState<ApiError | null>(null);
  const brand = company ? { name: company.name, logoUrl: company.logoUrl } : getCachedBrand();
  const name = brand?.name || 'Pointage RH';
  const logoUrl = brand?.logoUrl ?? null;

  const { register, handleSubmit, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { login: '', password: '' },
  });

  React.useEffect(() => { document.title = `Connexion · ${name}`; }, [name]);

  if (isLoading) {
    return <div className="flex min-h-dvh items-center justify-center"><PageLoader /></div>;
  }
  if (user) return <Navigate to={homePathFor(user, company)} replace />;

  const from = (location.state as { from?: string } | null)?.from;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await login.mutateAsync(values);
      const me = await qc.fetchQuery({ queryKey: authKeys.me, queryFn: fetchMe, staleTime: 0 }) as MeResponse | null;
      if (!me) throw new ApiError(401, 'UNAUTHENTICATED', "La session n'a pas pu être ouverte. Vérifiez que les cookies sont autorisés.");
      const home = homePathFor(me.user, me.company);
      const canUseFrom =
        from && !me.user.mustChangePassword && home !== '/admin/setup' &&
        ((from.startsWith('/app') && !!me.user.employee) || (from.startsWith('/admin') && me.user.role !== 'EMPLOYEE'));
      navigate(canUseFrom ? from : home, { replace: true });
    } catch (e) {
      setFormError(e instanceof ApiError ? e : new ApiError(0, 'UNKNOWN', 'Connexion impossible. Réessayez.'));
    }
  });

  const locked = formError?.status === 423 || formError?.code === 'ACCOUNT_LOCKED';
  const network = formError?.status === 0 || (!formError && meError instanceof ApiError && meError.status === 0);

  return (
    <div className="flex min-h-dvh bg-white">
      <BrandPanel name={name} logoUrl={logoUrl} />

      <main className="pt-safe pb-safe flex flex-1 flex-col">
        <div className="flex items-center gap-3 px-6 pt-8 lg:hidden">
          <BrandMark logoUrl={logoUrl} name={name} />
          <span className="text-base font-semibold text-ink">{name}</span>
        </div>

        <div className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10">
          <div className="w-full max-w-sm">
            <div className="mb-8">
              <h1 className="text-2xl font-semibold tracking-tight text-ink">Connexion</h1>
              <p className="mt-1.5 text-sm text-muted">Accédez à votre espace avec vos identifiants professionnels.</p>
            </div>

            {(formError || network) && (
              <div
                role="alert"
                className={cn(
                  'mb-5 flex gap-3 rounded-lg border px-3.5 py-3 text-sm',
                  locked ? 'border-warning-border bg-warning-soft text-warning-strong' : 'border-danger-border bg-danger-soft text-red-800',
                )}
              >
                {locked ? <Lock className="mt-0.5 h-4 w-4 shrink-0" /> : network ? <WifiOff className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />}
                <div>
                  <p className="font-semibold">
                    {locked ? 'Compte temporairement verrouillé' : network ? 'Serveur injoignable' : 'Connexion refusée'}
                  </p>
                  <p className="mt-0.5 leading-snug">
                    {formError?.message ?? 'Le serveur ne répond pas. Vérifiez que vous êtes connecté au réseau de l’entreprise.'}
                  </p>
                </div>
              </div>
            )}

            <form onSubmit={onSubmit} className="space-y-5" noValidate>
              <FormField label="Matricule ou email" htmlFor="login" error={errors.login}>
                <Input
                  id="login"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  autoFocus
                  placeholder="ex. EMP0012"
                  leftIcon={<User />}
                  className="h-11"
                  aria-invalid={!!errors.login}
                  {...register('login')}
                />
              </FormField>
              <FormField label="Mot de passe" htmlFor="password" error={errors.password}>
                <PasswordInput
                  id="password"
                  autoComplete="current-password"
                  className="h-11"
                  aria-invalid={!!errors.password}
                  {...register('password')}
                />
              </FormField>
              <Button type="submit" size="lg" block loading={login.isPending} className="h-11">
                Se connecter
              </Button>
            </form>

            <p className="mt-8 text-center text-xs leading-relaxed text-muted">
              Mot de passe oublié ou compte bloqué ? Adressez-vous au service des Ressources humaines.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
