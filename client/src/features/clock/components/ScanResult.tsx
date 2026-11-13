import { AlertTriangle, CheckCircle2, CircleX, Home, RotateCcw, Send, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui';
import { formatDateLong, formatTime, formatTimeSeconds } from '@/lib/format';
import type { ApiError } from '@/lib/api';
import type { ClockAction } from '@/lib/types';
import type { ScanResponse } from '../api';

const SUCCESS_TITLE: Record<ClockAction, string> = {
  ARRIVEE: 'Arrivée enregistrée',
  DEPART: 'Départ enregistré',
  PAUSE_DEBUT: 'Début de pause enregistré',
  PAUSE_FIN: 'Reprise enregistrée',
};

function existingTimeOf(details: unknown): string | null {
  const v = (details as { existingTime?: unknown } | null | undefined)?.existingTime;
  if (typeof v !== 'string' || !v) return null;
  return /^\d{2}:\d{2}/.test(v) ? v.slice(0, 5) : formatTime(v);
}

function Shell({ tone, children }: { tone: 'success' | 'danger' | 'neutral'; children: React.ReactNode }) {
  const bg = tone === 'success' ? 'bg-success' : tone === 'danger' ? 'bg-danger' : 'bg-ink';
  return (
    <div className={`${bg} pt-safe pb-safe flex min-h-dvh flex-col text-white animate-fade-in`}>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 py-8">{children}</div>
    </div>
  );
}

export function ScanSuccess({ action, result, onHome }: { action: ClockAction; result: ScanResponse; onHome: () => void }) {
  const warnings = result.warnings ?? [];
  return (
    <Shell tone="success">
      <div className="flex flex-1 flex-col items-center justify-center text-center" role="status" aria-live="assertive">
        <span className="flex h-28 w-28 items-center justify-center rounded-full bg-white/15 ring-8 ring-white/10 animate-zoom-in">
          <CheckCircle2 className="h-20 w-20" strokeWidth={1.75} aria-hidden />
        </span>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">{SUCCESS_TITLE[result.event?.type ?? action]}</h1>
        <p className="tabular mt-3 text-6xl font-semibold tracking-tight">{formatTime(result.event.serverTime)}</p>
        <p className="mt-2 text-sm text-white/85">
          {formatDateLong(result.event.serverTime)} · heure du serveur {formatTimeSeconds(result.event.serverTime)}
        </p>
        {result.message && <p className="mt-5 max-w-sm text-[15px] leading-relaxed text-white/95">{result.message}</p>}
        {warnings.length > 0 && (
          <ul className="mt-5 w-full space-y-2 text-left">
            {warnings.map((w) => (
              <li key={w} className="flex items-start gap-2.5 rounded-xl bg-white px-4 py-3 text-sm font-medium text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-strong" aria-hidden />
                {w}
              </li>
            ))}
          </ul>
        )}
      </div>
      <Button size="xl" block className="bg-white text-success hover:bg-white/90" leftIcon={<Home />} onClick={onHome}>
        Retour à l'accueil
      </Button>
    </Shell>
  );
}

export function ScanError({ error, onRetry, onHome }: { error: ApiError; onRetry: () => void; onHome: () => void }) {
  const existing = existingTimeOf(error.details);
  return (
    <Shell tone="danger">
      <div className="flex flex-1 flex-col items-center justify-center text-center" role="alert" aria-live="assertive">
        <span className="flex h-28 w-28 items-center justify-center rounded-full bg-white/15 ring-8 ring-white/10 animate-zoom-in">
          <CircleX className="h-20 w-20" strokeWidth={1.75} aria-hidden />
        </span>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">Pointage refusé</h1>
        <p className="mt-4 max-w-sm text-[17px] font-medium leading-relaxed">{error.message}</p>
        {existing && (
          <p className="mt-4 rounded-xl bg-white/15 px-4 py-2.5 text-[15px]">
            Pointage déjà enregistré à <span className="tabular font-semibold">{existing}</span>
          </p>
        )}
        <p className="mt-4 font-mono text-xs text-white/75">Code : {error.code}</p>
      </div>
      <div className="space-y-3">
        <Button size="xl" block className="bg-white text-danger hover:bg-white/90" leftIcon={<RotateCcw />} onClick={onRetry}>
          Réessayer
        </Button>
        <Button size="xl" block variant="ghost" className="text-white hover:bg-white/10 hover:text-white" leftIcon={<Home />} onClick={onHome}>
          Retour à l'accueil
        </Button>
      </div>
    </Shell>
  );
}

export function ScanNetworkError({ sending, onResend, onHome }: { sending: boolean; onResend: () => void; onHome: () => void }) {
  return (
    <Shell tone="neutral">
      <div className="flex flex-1 flex-col items-center justify-center text-center" role="alert" aria-live="assertive">
        <span className="flex h-24 w-24 items-center justify-center rounded-full bg-white/10 ring-8 ring-white/5">
          <WifiOff className="h-12 w-12 text-amber-300" aria-hidden />
        </span>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">Connexion perdue</h1>
        <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-slate-300">
          Votre pointage n'a pas pu être confirmé par le serveur. Vérifiez que vous êtes connecté au Wi-Fi de l'entreprise, puis renvoyez-le.
        </p>
        <p className="mt-3 max-w-sm text-sm text-slate-400">
          Le renvoi est sans risque : même s'il était déjà parvenu au serveur, il ne sera jamais compté deux fois.
        </p>
      </div>
      <div className="space-y-3">
        <Button size="xl" block className="bg-white text-ink hover:bg-white/90" loading={sending} leftIcon={<Send />} onClick={onResend}>
          Renvoyer le pointage
        </Button>
        <Button size="xl" block variant="ghost" className="text-white hover:bg-white/10 hover:text-white" leftIcon={<Home />} onClick={onHome}>
          Retour à l'accueil
        </Button>
      </div>
    </Shell>
  );
}
