import { useNavigate } from 'react-router-dom';
import { Coffee, LogIn, LogOut, Play, type LucideIcon } from 'lucide-react';
import { formatTime } from '@/lib/format';
import { scanSlug } from '@/lib/labels';
import type { ClockAction, ClockStatus } from '@/lib/types';
import { cn } from '@/lib/utils';

interface BigButtonProps {
  icon: LucideIcon;
  label: string;
  hint?: string;
  enabled: boolean;
  tone: 'brand' | 'dark' | 'amber' | 'green';
  size?: 'lg' | 'md';
  onClick: () => void;
}

const TONES = {
  brand: 'bg-brand text-white hover:bg-brand-700 active:bg-brand-800 focus-visible:ring-brand/40',
  dark: 'bg-ink text-white hover:bg-ink-soft active:bg-black focus-visible:ring-slate-400',
  amber: 'bg-amber-500 text-ink hover:bg-amber-400 active:bg-amber-600 focus-visible:ring-amber-300',
  green: 'bg-success text-white hover:bg-green-700 active:bg-green-800 focus-visible:ring-success/40',
} as const;

function BigButton({ icon: Icon, label, hint, enabled, tone, size = 'lg', onClick }: BigButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!enabled}
      aria-describedby={undefined}
      className={cn(
        'group flex w-full items-center gap-4 rounded-2xl px-5 text-left shadow-card transition-all focus-visible:outline-none focus-visible:ring-4 active:scale-[0.99]',
        size === 'lg' ? 'min-h-[84px] py-4' : 'min-h-[60px] py-3',
        enabled ? TONES[tone] : 'cursor-not-allowed border border-slate-200 bg-white text-slate-400 shadow-none',
      )}
    >
      <span className={cn('flex shrink-0 items-center justify-center rounded-xl', size === 'lg' ? 'h-12 w-12' : 'h-9 w-9', enabled ? 'bg-white/15' : 'bg-slate-100')}>
        <Icon className={size === 'lg' ? 'h-6 w-6' : 'h-5 w-5'} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block font-semibold tracking-tight', size === 'lg' ? 'text-lg' : 'text-[15px]')}>{label}</span>
        {hint && <span className={cn('mt-0.5 block text-[13px]', enabled ? 'opacity-85' : 'text-slate-500')}>{hint}</span>}
      </span>
    </button>
  );
}

function hintFor(action: ClockAction, s: ClockStatus, allowed: boolean): string | undefined {
  if (!s.clockingEnabled) return 'Pointage non activé';
  switch (action) {
    case 'ARRIVEE':
      if (s.arrivalAt) return `Arrivée pointée à ${formatTime(s.arrivalAt)}`;
      return allowed ? 'Scannez le QR Code ENTRÉE' : 'Indisponible pour le moment';
    case 'DEPART':
      if (s.departureAt) return `Départ pointé à ${formatTime(s.departureAt)}`;
      if (!s.arrivalAt) return "Pointez d'abord votre arrivée";
      return allowed ? 'Scannez le QR Code SORTIE' : 'Terminez votre pause avant de partir';
    case 'PAUSE_DEBUT': {
      const used = s.breaks.length;
      if (allowed) return s.maxBreaks > 0 ? `Pause ${used + 1} sur ${s.maxBreaks} autorisée(s)` : undefined;
      if (s.maxBreaks > 0 && used >= s.maxBreaks) return 'Nombre maximal de pauses atteint';
      return 'Disponible une fois arrivé';
    }
    case 'PAUSE_FIN':
      return allowed ? 'Pointez votre retour de pause' : 'Aucune pause en cours';
  }
}

export function ClockActions({ status }: { status: ClockStatus }) {
  const navigate = useNavigate();
  const can = (a: ClockAction) => status.clockingEnabled && status.allowedActions.includes(a);
  const go = (a: ClockAction) => navigate(`/app/scan/${scanSlug(a)}`);
  const onBreak = can('PAUSE_FIN');

  return (
    <div className="space-y-3">
      <BigButton icon={LogIn} label="Pointer mon arrivée" tone="brand" enabled={can('ARRIVEE')} hint={hintFor('ARRIVEE', status, can('ARRIVEE'))} onClick={() => go('ARRIVEE')} />
      <BigButton icon={LogOut} label="Pointer mon départ" tone="dark" enabled={can('DEPART')} hint={hintFor('DEPART', status, can('DEPART'))} onClick={() => go('DEPART')} />
      {status.breakTracking && (
        <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
          {onBreak ? (
            <div className="min-[400px]:col-span-2">
              <BigButton size="md" icon={Play} label="Reprendre" tone="green" enabled hint={hintFor('PAUSE_FIN', status, true)} onClick={() => go('PAUSE_FIN')} />
            </div>
          ) : (
            <div className="min-[400px]:col-span-2">
              <BigButton size="md" icon={Coffee} label="Commencer ma pause" tone="amber" enabled={can('PAUSE_DEBUT')} hint={hintFor('PAUSE_DEBUT', status, can('PAUSE_DEBUT'))} onClick={() => go('PAUSE_DEBUT')} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
