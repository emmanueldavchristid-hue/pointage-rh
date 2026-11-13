import * as React from 'react';
import { Construction } from 'lucide-react';
import { EmptyState, ErrorState } from '@/components/ui';
import { isApiError } from '@/lib/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { cn } from '@/lib/utils';

/** 404 sur un endpoint encore en cours de déploiement côté serveur. */
export const isNotReady = (e: unknown) => isApiError(e) && e.status === 404;

/** Erreur de chargement : affiche un état « module bientôt disponible » pour les 404, sinon l'erreur serveur. */
export function QueryError({ error, onRetry, compact, label }: { error: unknown; onRetry?: () => void; compact?: boolean; label?: string }) {
  if (isNotReady(error)) {
    return (
      <EmptyState
        compact={compact}
        icon={Construction}
        title="Données momentanément indisponibles"
        description={`Le service ${label ? `« ${label} » ` : ''}n'est pas encore disponible sur le serveur. Réessayez dans quelques instants.`}
      />
    );
  }
  return <ErrorState error={error} onRetry={onRetry} compact={compact} />;
}

/** Droits d'écriture RH (SUPER_ADMIN, HR_ADMIN) ; un MANAGER est en lecture seule. */
export function useIsHR() {
  const { hasRole } = useAuth();
  return hasRole('SUPER_ADMIN', 'HR_ADMIN');
}

/** Petite ligne « libellé : valeur » pour les fiches. */
export function InfoRow({ label, children, className }: { label: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-baseline sm:gap-4', className)}>
      <dt className="w-44 shrink-0 text-sm text-muted">{label}</dt>
      <dd className="min-w-0 text-sm font-medium text-ink">{children ?? '—'}</dd>
    </div>
  );
}

/** Bloc mot de passe / identifiant copiable. */
export function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = React.useState(false);
  async function copy() {
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(value);
      else {
        const ta = document.createElement('textarea');
        ta.value = value;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignoré */
    }
  }
  return (
    <div className="space-y-1">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
        <code className="min-w-0 flex-1 truncate font-mono text-sm text-ink">{value}</code>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-brand hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
        >
          {copied ? 'Copié' : 'Copier'}
        </button>
      </div>
    </div>
  );
}
