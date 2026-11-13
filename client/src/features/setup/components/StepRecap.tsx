import * as React from 'react';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, Circle, Power } from 'lucide-react';
import { Button } from '@/components/ui';
import { useAuth } from '@/features/auth/AuthProvider';
import { isApiError, errorMessage, type ApiError } from '@/lib/api';
import { useActivateClocking, type SetupStatus } from '../api';
import { BackButton, StepShell } from './StepShell';

export function Checklist({ items }: { items: SetupStatus['checklist'] }) {
  return (
    <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
      {items.map((c) => (
        <li key={c.key} className="flex items-center gap-3 px-4 py-3 text-sm">
          {c.done ? <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-hidden /> : <Circle className="h-5 w-5 shrink-0 text-slate-300" aria-hidden />}
          <span className={c.done ? 'text-ink' : 'text-slate-600'}>{c.label}</span>
          <span className="sr-only">{c.done ? ' : fait' : ' : à faire'}</span>
          {!c.done && <span className="ml-auto text-xs font-medium text-warning-strong">À compléter</span>}
        </li>
      ))}
    </ul>
  );
}

export function StepRecap({ status, onBack, onActivated }: { status: SetupStatus; onBack?: () => void; onActivated: () => void }) {
  const activate = useActivateClocking();
  const { refresh } = useAuth();
  const [error, setError] = React.useState<ApiError | null>(null);
  const missing = status.checklist.filter((c) => !c.done);

  const run = async () => {
    setError(null);
    try {
      await activate.mutateAsync();
      await refresh();
      toast.success('Pointage activé. Vos employés peuvent pointer dès maintenant.');
      onActivated();
    } catch (e) {
      if (isApiError(e)) setError(e);
      else toast.error(errorMessage(e));
    }
  };

  return (
    <StepShell
      title="Récapitulatif"
      description="Vérifiez que tout est prêt, puis ouvrez le pointage à vos employés."
      footer={<>
        <BackButton onClick={onBack} />
        <Button size="lg" variant="success" leftIcon={<Power />} loading={activate.isPending} onClick={run}>
          {status.setupCompleted && !status.clockingEnabled ? 'Réactiver le pointage' : 'Activer le pointage'}
        </Button>
      </>}
    >
      <div className="space-y-4">
        <Checklist items={status.checklist} />
        {missing.length > 0 && !error && (
          <p className="text-sm text-muted">
            {missing.length === 1 ? 'Un élément reste' : `${missing.length} éléments restent`} à compléter avant l'activation.
          </p>
        )}
        {error && (
          <div className="flex items-start gap-3 rounded-xl border border-danger-border bg-danger-soft p-4 text-sm text-red-900" role="alert">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />
            <div>
              <p className="font-semibold">{error.code === 'SETUP_INCOMPLETE' ? 'Configuration incomplète' : "L'activation a échoué"}</p>
              <p className="mt-0.5">{error.message}</p>
            </div>
          </div>
        )}
        <p className="text-xs leading-relaxed text-muted">
          Après activation, les employés pourront pointer avec leur téléphone en scannant les bornes. Vous pourrez suspendre le pointage à tout moment depuis les paramètres.
        </p>
      </div>
    </StepShell>
  );
}
