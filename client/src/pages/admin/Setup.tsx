import * as React from 'react';
import { Link } from 'react-router-dom';
import {
  Building2, CalendarClock, CalendarDays, ChevronRight, PauseCircle, Power, QrCode, Settings, Settings2, ShieldCheck, Users, Wifi,
  type LucideIcon,
} from 'lucide-react';
import { Button, Card, PageHeader, Skeleton } from '@/components/ui';
import { QueryError } from '@/features/employee/components/QueryError';
import { useSetupStatus, type SetupStatus } from '@/features/setup/api';
import { SetupStepper, type StepDef } from '@/features/setup/components/SetupStepper';
import { StepCompany } from '@/features/setup/components/StepCompany';
import { StepLocations } from '@/features/setup/components/StepLocations';
import { StepNetwork } from '@/features/setup/components/StepNetwork';
import { Checklist, StepRecap } from '@/features/setup/components/StepRecap';
import { StepSchedule } from '@/features/setup/components/StepSchedule';

const STEPS: { key: string; label: string; icon: LucideIcon }[] = [
  { key: 'company', label: 'Établissement', icon: Building2 },
  { key: 'schedule', label: 'Horaire', icon: CalendarClock },
  { key: 'locations', label: 'QR Codes', icon: QrCode },
  { key: 'network', label: 'Réseau local', icon: Wifi },
  { key: 'recap', label: 'Activation', icon: Power },
];

const LINKS: { to: string; label: string; description: string; icon: LucideIcon }[] = [
  { to: '/admin/settings', label: 'Paramètres', description: 'Établissement, réseau, sécurité, sauvegardes', icon: Settings },
  { to: '/admin/schedules', label: 'Horaires', description: 'Horaires par équipe et affectations', icon: CalendarClock },
  { to: '/admin/locations', label: 'QR Codes & bornes', description: 'Liens de borne, rotation, affiches', icon: QrCode },
  { to: '/admin/holidays', label: 'Jours fériés', description: 'Calendrier des fériés', icon: CalendarDays },
  { to: '/admin/employees', label: 'Employés', description: 'Fiches, comptes et badges', icon: Users },
];

function Overview({ status, onReview }: { status: SetupStatus; onReview: () => void }) {
  const active = status.clockingEnabled;
  return (
    <div className="space-y-5">
      <Card className={active ? 'border-success-border bg-success-soft' : 'border-warning-border bg-warning-soft'}>
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
          <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white ${active ? 'bg-success' : 'bg-warning'}`}>
            {active ? <ShieldCheck className="h-6 w-6" aria-hidden /> : <PauseCircle className="h-6 w-6" aria-hidden />}
          </span>
          <div className="flex-1">
            <h2 className={`text-base font-semibold ${active ? 'text-green-900' : 'text-amber-900'}`}>
              {active ? 'Le pointage est actif' : 'Le pointage est suspendu'}
            </h2>
            <p className={`text-sm ${active ? 'text-green-800' : 'text-amber-800'}`}>
              {active ? 'La configuration initiale est terminée. Vos employés peuvent pointer avec leur téléphone.' : 'La configuration est terminée mais les employés ne peuvent pas pointer pour le moment.'}
            </p>
          </div>
          <Button variant="outline" leftIcon={<Settings2 />} onClick={onReview}>
            {active ? "Revoir l'assistant" : 'Réactiver'}
          </Button>
        </div>
      </Card>

      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="p-5 lg:col-span-2">
          <h3 className="mb-3 text-sm font-semibold text-ink">État de la configuration</h3>
          <Checklist items={status.checklist} />
        </Card>
        <Card className="p-5 lg:col-span-3">
          <h3 className="mb-3 text-sm font-semibold text-ink">Aller plus loin</h3>
          <ul className="grid gap-2 sm:grid-cols-2">
            {LINKS.map((l) => (
              <li key={l.to}>
                <Link to={l.to} className="group flex min-h-[64px] items-center gap-3 rounded-xl border border-slate-200 p-3 transition-colors hover:border-brand-200 hover:bg-brand-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 group-hover:bg-brand-50 group-hover:text-brand"><l.icon className="h-4 w-4" aria-hidden /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink">{l.label}</span>
                    <span className="block truncate text-xs text-muted">{l.description}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 text-slate-400" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

export default function AdminSetupPage() {
  const q = useSetupStatus();
  const [wizard, setWizard] = React.useState<boolean | null>(null);
  const [step, setStep] = React.useState<number | null>(null);
  const topRef = React.useRef<HTMLDivElement>(null);

  const status = q.data;
  const doneOf = React.useCallback((key: string) => status?.checklist.find((c) => c.key === key)?.done ?? false, [status]);

  // Premier affichage : assistant si la configuration n'est pas terminée, sinon récapitulatif.
  React.useEffect(() => {
    if (!status || wizard !== null) return;
    const finished = status.setupCompleted && status.clockingEnabled;
    setWizard(!finished);
    const first = STEPS.findIndex((s) => s.key !== 'recap' && !(status.checklist.find((c) => c.key === s.key)?.done ?? false));
    setStep(first === -1 ? STEPS.length - 1 : first);
  }, [status, wizard]);

  const go = (i: number) => {
    setStep(Math.max(0, Math.min(STEPS.length - 1, i)));
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const steps: StepDef[] = STEPS.map((s) => ({ ...s, done: s.key === 'recap' ? !!status?.clockingEnabled : doneOf(s.key) }));
  const current = step ?? 0;
  const next = () => go(current + 1);
  const back = current > 0 ? () => go(current - 1) : undefined;

  return (
    <div ref={topRef} className="mx-auto max-w-4xl scroll-mt-20 space-y-6">
      <PageHeader
        title="Configuration initiale"
        description={wizard ? 'Quelques étapes pour préparer le pointage de votre établissement.' : "État de la configuration de l'établissement."}
        actions={wizard && status?.setupCompleted && status.clockingEnabled ? <Button variant="ghost" onClick={() => setWizard(false)}>Fermer l'assistant</Button> : undefined}
      />

      {q.isPending || wizard === null ? (
        <div className="space-y-4"><Skeleton className="h-12 rounded-xl" /><Skeleton className="h-96 rounded-xl" /></div>
      ) : q.isError ? (
        <Card><QueryError error={q.error} onRetry={q.refetch} /></Card>
      ) : !wizard ? (
        <Overview status={status!} onReview={() => { setWizard(true); setStep(status!.clockingEnabled ? 0 : STEPS.length - 1); }} />
      ) : (
        <>
          <Card className="px-4 py-3 sm:px-5"><SetupStepper steps={steps} current={current} onSelect={go} /></Card>
          <div key={current} className="animate-fade-in">
            {STEPS[current].key === 'company' && <StepCompany onDone={next} onBack={back} />}
            {STEPS[current].key === 'schedule' && <StepSchedule onDone={next} onBack={back} />}
            {STEPS[current].key === 'locations' && <StepLocations onDone={next} onBack={back} />}
            {STEPS[current].key === 'network' && <StepNetwork onDone={next} onBack={back} />}
            {STEPS[current].key === 'recap' && <StepRecap status={status!} onBack={back} onActivated={() => setWizard(false)} />}
          </div>
        </>
      )}
    </div>
  );
}
