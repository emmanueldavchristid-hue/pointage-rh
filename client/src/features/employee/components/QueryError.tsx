import { PlugZap } from 'lucide-react';
import { EmptyState, ErrorState } from '@/components/ui';
import { isApiError } from '@/lib/api';

/** Erreur de chargement ; un 404 « route inconnue » = fonctionnalité pas encore disponible côté serveur. */
export function QueryError({ error, onRetry, compact = true, className }: { error: unknown; onRetry?: () => void; compact?: boolean; className?: string }) {
  if (isApiError(error) && error.status === 404) {
    return (
      <EmptyState
        compact={compact}
        className={className}
        icon={PlugZap}
        title="Bientôt disponible"
        description="Cette rubrique n'est pas encore disponible sur le serveur de votre entreprise. Réessayez plus tard."
      />
    );
  }
  return <ErrorState error={error} onRetry={onRetry} compact={compact} className={className} />;
}
