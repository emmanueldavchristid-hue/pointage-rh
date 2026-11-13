import { useParams, useSearchParams } from 'react-router-dom';
import { LogIn, LogOut, RefreshCw, ScanLine, ShieldX, Smartphone, WifiOff } from 'lucide-react';
import { useKioskToken, useServerNow, useWakeLock } from '@/features/kiosk/useKioskToken';
import { assetUrl } from '@/lib/api';
import { formatDateLong, formatTimeSeconds } from '@/lib/format';
import { cn } from '@/lib/utils';

/** /borne/:code?k=displayKey — écran fixe public affichant le QR de localisation tournant. */
export default function KioskPage() {
  const { code } = useParams();
  const [params] = useSearchParams();
  const { token, offset, status, message, retry } = useKioskToken(code, params.get('k'));
  const now = useServerNow(offset);
  useWakeLock();

  if (status === 'forbidden') {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-ink px-8 text-center text-white">
        <span className="flex h-20 w-20 items-center justify-center rounded-2xl bg-danger/20 ring-1 ring-danger/40">
          <ShieldX className="h-10 w-10 text-red-300" aria-hidden />
        </span>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight">Borne non autorisée</h1>
        <p className="mt-3 max-w-lg text-lg text-slate-300">{message ?? 'La clé de cette borne est invalide ou a été révoquée.'}</p>
        <p className="mt-6 max-w-lg text-sm text-slate-400">
          Un administrateur doit rouvrir le lien de borne depuis « QR Codes & bornes » dans l'administration.
        </p>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-ink text-white">
        {status === 'offline' || status === 'error' ? (
          <>
            <WifiOff className="h-12 w-12 text-amber-300" aria-hidden />
            <p className="text-xl font-medium">Connexion au serveur impossible</p>
            <p className="text-slate-400">Nouvel essai automatique en cours…</p>
            <button type="button" onClick={retry} className="mt-2 inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-white/10 px-4 text-sm hover:bg-white/15">
              <RefreshCw className="h-4 w-4" aria-hidden /> Réessayer maintenant
            </button>
          </>
        ) : (
          <>
            <RefreshCw className="h-10 w-10 animate-spin text-slate-400" aria-hidden />
            <p className="text-slate-300">Chargement de la borne…</p>
          </>
        )}
      </div>
    );
  }

  const isEntry = token.type === 'ENTREE';
  const expMs = token.expiresAt ? new Date(token.expiresAt).getTime() : null;
  const remaining = expMs ? Math.max(0, Math.ceil((expMs - now) / 1000)) : null;
  const rotation = Math.max(1, token.rotationSeconds || 30);
  const ratio = remaining !== null ? Math.min(1, remaining / rotation) : 1;
  const expired = remaining === 0;
  const TypeIcon = isEntry ? LogIn : LogOut;
  const logo = assetUrl(token.logoUrl);

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50 text-ink">
      <header className={cn('flex items-center justify-between gap-6 px-6 py-4 text-white sm:px-10', isEntry ? 'bg-brand' : 'bg-danger')}>
        <div className="flex min-w-0 items-center gap-4">
          {logo ? (
            <img src={logo} alt="" className="h-12 w-12 shrink-0 rounded-xl bg-white object-contain p-1" />
          ) : (
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/15"><ScanLine className="h-6 w-6" aria-hidden /></span>
          )}
          <div className="min-w-0">
            <p className="truncate text-xl font-semibold sm:text-2xl">{token.companyName}</p>
            <p className="truncate text-sm text-white/85 sm:text-base">{token.label}</p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="tabular text-3xl font-semibold tracking-tight sm:text-5xl" aria-label="Heure du serveur">{formatTimeSeconds(now)}</p>
          <p className="hidden text-sm text-white/85 sm:block">{formatDateLong(now)}</p>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-6 landscape:flex-row landscape:gap-14 sm:px-10">
        <div className="relative rounded-3xl bg-white p-5 shadow-pop ring-1 ring-slate-200">
          <img
            src={token.png}
            alt={`QR Code de pointage ${isEntry ? "d'entrée" : 'de sortie'}`}
            className={cn('block aspect-square transition-[filter] [image-rendering:pixelated]', expired && status !== 'ok' && 'blur-sm')}
            style={{ width: 'min(68vh, 82vw)' }}
          />
          {expired && status !== 'ok' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-3xl bg-white/80 text-center">
              <RefreshCw className="h-10 w-10 animate-spin text-slate-500" aria-hidden />
              <p className="text-lg font-semibold">Actualisation du code…</p>
            </div>
          )}
        </div>

        <div className="flex max-w-xl flex-col items-center text-center landscape:items-start landscape:text-left">
          <span className={cn('inline-flex items-center gap-4 rounded-2xl px-6 py-3 text-white', isEntry ? 'bg-brand' : 'bg-danger')}>
            <TypeIcon className="h-10 w-10 sm:h-14 sm:w-14" aria-hidden />
            <span className="text-5xl font-bold tracking-tight sm:text-7xl">{isEntry ? 'ENTRÉE' : 'SORTIE'}</span>
          </span>
          <p className="mt-6 flex items-start gap-3 text-2xl font-medium leading-snug text-ink sm:text-3xl">
            <Smartphone className="mt-1 h-8 w-8 shrink-0 text-muted" aria-hidden />
            Ouvrez l'application Pointage RH et scannez ce code
          </p>
          <p className="mt-3 text-lg text-muted">
            {isEntry ? 'Pour enregistrer votre arrivée.' : 'Pour enregistrer votre départ.'}
          </p>

          {remaining !== null && (
            <div className="mt-8 w-full max-w-sm">
              <div className="flex items-baseline justify-between text-base text-muted">
                <span>Nouveau code dans</span>
                <span className="tabular text-2xl font-semibold text-ink">{remaining} s</span>
              </div>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-200">
                <div className={cn('h-full rounded-full transition-[width] duration-300 ease-linear', isEntry ? 'bg-brand' : 'bg-danger')} style={{ width: `${ratio * 100}%` }} />
              </div>
            </div>
          )}
        </div>
      </main>

      <footer className="pb-safe flex min-h-[40px] items-center justify-center px-6 pb-3 text-sm" aria-live="polite">
        {status === 'offline' || status === 'error' ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-amber-900">
            <WifiOff className="h-3.5 w-3.5" aria-hidden /> Connexion perdue, nouvel essai automatique…
          </span>
        ) : (
          <span className="text-slate-400">
            {remaining !== null ? 'Le code change automatiquement : une photo du code ne permet pas de pointer.' : 'Pointage réservé au personnel, sur le réseau de l\'entreprise.'}
          </span>
        )}
      </footer>
    </div>
  );
}
