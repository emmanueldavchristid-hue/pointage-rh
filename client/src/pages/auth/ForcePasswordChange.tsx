import { LogOut, ShieldCheck } from 'lucide-react';
import { Button, Card } from '@/components/ui';
import { BrandMark } from '@/components/layout/BrandMark';
import { displayName, useAuth } from '@/features/auth/AuthProvider';
import { ChangePasswordForm } from '@/features/auth/ChangePasswordForm';

/** Affiché à la place de l'application tant que user.mustChangePassword = true. */
export function ForcePasswordChange() {
  const { user, company, logout, refresh } = useAuth();
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-surface px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-3">
          <BrandMark logoUrl={company?.logoUrl} name={company?.name} />
          <span className="text-base font-semibold text-ink">{company?.name ?? 'Pointage RH'}</span>
        </div>
        <Card className="p-6 sm:p-8">
          <div className="mb-6 flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-lg font-semibold text-ink">Définissez votre mot de passe</h1>
              <p className="mt-1 text-sm text-muted">
                Bonjour {displayName(user)}, pour sécuriser votre compte, remplacez le mot de passe provisoire par un mot de passe personnel.
              </p>
            </div>
          </div>
          <ChangePasswordForm submitLabel="Enregistrer et continuer" onSuccess={() => void refresh()} />
        </Card>
        <div className="mt-4 text-center">
          <Button variant="ghost" size="sm" leftIcon={<LogOut />} onClick={() => void logout()}>Se déconnecter</Button>
        </div>
      </div>
    </div>
  );
}
