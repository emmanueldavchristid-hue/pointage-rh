import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ScanLine } from 'lucide-react';
import { EmptyState } from '@/components/ui';
import { CLOCK_ACTION, SCAN_ACTION_SLUGS } from '@/lib/labels';

/** /app/scan/:action — action ∈ arrivee | depart | pause-debut | pause-fin. Page plein écran (hors barre de navigation). */
export default function AppScanPage() {
  const { action = '' } = useParams();
  const apiAction = SCAN_ACTION_SLUGS[action];
  return (
    <div className="pt-safe pb-safe mx-auto flex min-h-dvh max-w-lg flex-col bg-surface">
      <header className="flex h-14 items-center gap-2 px-2">
        <Link to="/app" className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100" aria-label="Retour">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-base font-semibold text-ink">{apiAction ? `Scanner — ${CLOCK_ACTION[apiAction]}` : 'Scanner'}</h1>
      </header>
      <div className="flex flex-1 items-center justify-center px-4">
        <EmptyState icon={ScanLine} title="En cours de construction" description="Le scanner de QR Code sera bientôt disponible." />
      </div>
    </div>
  );
}
