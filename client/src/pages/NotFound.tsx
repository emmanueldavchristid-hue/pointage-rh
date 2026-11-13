import { Link } from 'react-router-dom';
import { ArrowLeft, Compass } from 'lucide-react';
import { buttonVariants } from '@/components/ui';
import { homePathFor, useAuth } from '@/features/auth/AuthProvider';

export default function NotFoundPage() {
  const { user, company } = useAuth();
  const home = user ? homePathFor(user, company) : '/login';
  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface px-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-500 shadow-xs">
          <Compass className="h-6 w-6" />
        </div>
        <p className="text-sm font-semibold text-brand">Erreur 404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">Page introuvable</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          L'adresse demandée n'existe pas ou a été déplacée. Vérifiez le lien ou revenez à votre espace.
        </p>
        <Link to={home} className={buttonVariants({ className: 'mt-8' })}>
          <ArrowLeft />
          {user ? 'Retour à mon espace' : 'Aller à la connexion'}
        </Link>
      </div>
    </div>
  );
}
