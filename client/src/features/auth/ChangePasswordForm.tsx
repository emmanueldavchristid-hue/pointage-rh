import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { Button, FormField, Input } from '@/components/ui';
import { ApiError, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useChangePassword } from './api';

const schema = z
  .object({
    currentPassword: z.string().min(1, 'Saisissez votre mot de passe actuel.'),
    newPassword: z
      .string()
      .min(8, 'Au moins 8 caractères.')
      .regex(/[0-9]/, 'Au moins un chiffre.')
      .regex(/[A-Za-zÀ-ÿ]/, 'Au moins une lettre.'),
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, { path: ['confirm'], message: 'Les mots de passe ne correspondent pas.' })
  .refine((v) => v.newPassword !== v.currentPassword, { path: ['newPassword'], message: "Le nouveau mot de passe doit être différent de l'actuel." });

type Values = z.infer<typeof schema>;

export function PasswordInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = React.useState(false);
  return (
    <Input
      {...props}
      type={show ? 'text' : 'password'}
      rightSlot={
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="flex h-8 w-9 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
          aria-label={show ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
          aria-pressed={show}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      }
    />
  );
}

function Rule({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className={cn('flex items-center gap-2 text-xs', ok ? 'text-green-700' : 'text-muted')}>
      <span className={cn('h-1.5 w-1.5 rounded-full', ok ? 'bg-success' : 'bg-slate-300')} />
      {children}
    </li>
  );
}

export function ChangePasswordForm({ onSuccess, submitLabel = 'Mettre à jour le mot de passe' }: { onSuccess?: () => void; submitLabel?: string }) {
  const mutation = useChangePassword();
  const { register, handleSubmit, watch, setError, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: '', newPassword: '', confirm: '' },
  });
  const pwd = watch('newPassword') ?? '';

  const onSubmit = handleSubmit(async (v) => {
    try {
      await mutation.mutateAsync({ currentPassword: v.currentPassword, newPassword: v.newPassword });
      toast.success('Mot de passe mis à jour.');
      onSuccess?.();
    } catch (e) {
      if (e instanceof ApiError && (e.status === 400 || e.status === 401 || e.code.includes('PASSWORD'))) {
        setError('currentPassword', { message: e.message });
      } else {
        toast.error(errorMessage(e));
      }
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <FormField label="Mot de passe actuel" htmlFor="currentPassword" error={errors.currentPassword} required>
        <PasswordInput id="currentPassword" autoComplete="current-password" aria-invalid={!!errors.currentPassword} {...register('currentPassword')} />
      </FormField>
      <FormField label="Nouveau mot de passe" htmlFor="newPassword" error={errors.newPassword} required>
        <PasswordInput id="newPassword" autoComplete="new-password" aria-invalid={!!errors.newPassword} {...register('newPassword')} />
      </FormField>
      <ul className="grid gap-1 sm:grid-cols-3">
        <Rule ok={pwd.length >= 8}>8 caractères</Rule>
        <Rule ok={/[A-Za-zÀ-ÿ]/.test(pwd)}>Une lettre</Rule>
        <Rule ok={/[0-9]/.test(pwd)}>Un chiffre</Rule>
      </ul>
      <FormField label="Confirmer le nouveau mot de passe" htmlFor="confirm" error={errors.confirm} required>
        <PasswordInput id="confirm" autoComplete="new-password" aria-invalid={!!errors.confirm} {...register('confirm')} />
      </FormField>
      <Button type="submit" block loading={mutation.isPending}>{submitLabel}</Button>
    </form>
  );
}
