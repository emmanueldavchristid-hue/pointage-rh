import * as React from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Camera, CameraOff, ChevronDown, HelpCircle, Loader2, Lock, ScanLine, Smartphone, VideoOff } from 'lucide-react';
import { Button } from '@/components/ui';
import { clockKeys, postScan, type ScanInput, type ScanResponse } from '@/features/clock/api';
import { QrScanner, type CameraErrorKind } from '@/features/clock/components/QrScanner';
import { ScanError, ScanNetworkError, ScanSuccess } from '@/features/clock/components/ScanResult';
import { ApiError, isApiError } from '@/lib/api';
import { SCAN_ACTION_SLUGS } from '@/lib/labels';
import type { ClockAction } from '@/lib/types';
import { cn, uuid } from '@/lib/utils';

type Phase =
  | { k: 'checking' }
  | { k: 'intro' }
  | { k: 'scanning' }
  | { k: 'sending' }
  | { k: 'success'; result: ScanResponse }
  | { k: 'error'; error: ApiError }
  | { k: 'network' }
  | { k: 'camera'; reason: CameraErrorKind | 'insecure' | 'unsupported' };

const ACTION_COPY: Record<ClockAction, { title: string; hint: string }> = {
  ARRIVEE: { title: 'Pointer mon arrivée', hint: "Visez le QR Code ENTRÉE affiché à l'accueil." },
  DEPART: { title: 'Pointer mon départ', hint: 'Visez le QR Code SORTIE affiché à la sortie.' },
  PAUSE_DEBUT: { title: 'Commencer ma pause', hint: 'Visez le QR Code affiché sur la borne.' },
  PAUSE_FIN: { title: 'Reprendre le travail', hint: 'Visez le QR Code affiché sur la borne.' },
};

const vibrate = (pattern: number | number[]) => {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* non supporté */
  }
};

const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
const IS_IOS = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document);
const IS_ANDROID = /Android/i.test(ua);

function FullDark({ children, onBack, title }: { children: React.ReactNode; onBack: () => void; title: string }) {
  return (
    <div className="pt-safe pb-safe flex min-h-dvh flex-col bg-ink text-white">
      <header className="mx-auto flex w-full max-w-md items-center gap-2 px-3 py-2">
        <button type="button" onClick={onBack} className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40" aria-label="Retour à l'accueil">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-base font-semibold">{title}</h1>
      </header>
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-6">{children}</div>
    </div>
  );
}

function HelpDisclosure() {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="mt-4 text-center">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-slate-300 underline-offset-4 hover:text-white hover:underline"
      >
        <HelpCircle className="h-4 w-4" aria-hidden /> Problème de scan ?
        <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div className="mt-2 rounded-xl bg-white/5 p-4 text-left text-sm leading-relaxed text-slate-300 ring-1 ring-white/10">
          <p>Pour des raisons de sécurité, le pointage ne peut pas être saisi à la main.</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Nettoyez l'objectif et rapprochez-vous de l'écran (20 à 40 cm).</li>
            <li>Vérifiez que vous êtes connecté au Wi-Fi de l'entreprise.</li>
            <li>Si le problème persiste, présentez-vous aux RH : ils peuvent enregistrer votre pointage de secours avec votre badge personnel.</li>
          </ul>
        </div>
      )}
    </div>
  );
}

function CameraProblem({ reason, onRetry }: { reason: CameraErrorKind | 'insecure' | 'unsupported'; onRetry: () => void }) {
  const content = {
    insecure: {
      icon: Lock,
      title: 'Connexion sécurisée requise',
      body: (
        <>
          <p>Les navigateurs n'autorisent l'accès à la caméra que sur une adresse sécurisée (commençant par <span className="font-mono text-white">https://</span>).</p>
          <p className="mt-2">Ouvrez l'application avec l'adresse HTTPS communiquée par votre entreprise, ou signalez-le au service informatique.</p>
        </>
      ),
    },
    unsupported: {
      icon: VideoOff,
      title: 'Caméra non prise en charge',
      body: <p>Ce navigateur ne permet pas d'utiliser la caméra. Utilisez une version récente de Chrome (Android) ou Safari (iPhone).</p>,
    },
    'no-camera': {
      icon: VideoOff,
      title: 'Aucune caméra détectée',
      body: <p>Aucune caméra n'a été trouvée sur cet appareil. Pointez depuis votre téléphone ou présentez-vous aux RH pour un pointage de secours par badge.</p>,
    },
    busy: {
      icon: CameraOff,
      title: 'Caméra indisponible',
      body: <p>La caméra est peut-être utilisée par une autre application. Fermez les autres applications (appel vidéo, appareil photo), puis réessayez.</p>,
    },
    unknown: {
      icon: CameraOff,
      title: "La caméra n'a pas pu démarrer",
      body: <p>Réessayez. Si le problème persiste, redémarrez votre navigateur ou présentez-vous aux RH.</p>,
    },
    denied: {
      icon: CameraOff,
      title: "Accès à la caméra refusé",
      body: (
        <>
          <p>Autorisez la caméra pour cette application, puis réessayez :</p>
          {(IS_ANDROID || !IS_IOS) && (
            <div className="mt-3">
              <p className="font-semibold text-white">Android (Chrome)</p>
              <ol className="mt-1 list-decimal space-y-0.5 pl-5">
                <li>Touchez l'icône à gauche de l'adresse (cadenas ou réglages).</li>
                <li>Ouvrez « Autorisations » puis « Caméra ».</li>
                <li>Choisissez « Autoriser » et rechargez la page.</li>
              </ol>
            </div>
          )}
          {(IS_IOS || !IS_ANDROID) && (
            <div className="mt-3">
              <p className="font-semibold text-white">iPhone (Safari)</p>
              <ol className="mt-1 list-decimal space-y-0.5 pl-5">
                <li>Touchez « aA » dans la barre d'adresse.</li>
                <li>Ouvrez « Réglages du site web » puis « Caméra ».</li>
                <li>Choisissez « Autoriser ». Sinon : Réglages &gt; Safari &gt; Caméra.</li>
              </ol>
            </div>
          )}
        </>
      ),
    },
  }[reason];
  const Icon = content.icon;
  return (
    <div className="flex flex-1 flex-col" role="alert">
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <span className="flex h-20 w-20 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/15">
          <Icon className="h-9 w-9 text-amber-300" aria-hidden />
        </span>
        <h2 className="mt-5 text-xl font-semibold">{content.title}</h2>
        <div className="mt-3 max-w-sm text-left text-sm leading-relaxed text-slate-300">{content.body}</div>
      </div>
      {reason !== 'insecure' && reason !== 'unsupported' && reason !== 'no-camera' && (
        <Button size="xl" block className="bg-white text-ink hover:bg-white/90" leftIcon={<Camera />} onClick={onRetry}>
          Réessayer
        </Button>
      )}
      <HelpDisclosure />
    </div>
  );
}

export default function AppScanPage() {
  const { action: slug } = useParams();
  const action = slug ? SCAN_ACTION_SLUGS[slug] : undefined;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [phase, setPhase] = React.useState<Phase>({ k: 'checking' });
  const [cameraReady, setCameraReady] = React.useState(false);
  const [scanSession, setScanSession] = React.useState(0);
  const attempt = React.useRef<ScanInput | null>(null);
  const inFlight = React.useRef(false);
  const mounted = React.useRef(true);

  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const goHome = React.useCallback(() => navigate('/app', { replace: true }), [navigate]);

  // Pré-vérifications : HTTPS, support caméra, autorisation déjà accordée.
  React.useEffect(() => {
    if (!window.isSecureContext) return setPhase({ k: 'camera', reason: 'insecure' });
    if (!navigator.mediaDevices?.getUserMedia) return setPhase({ k: 'camera', reason: 'unsupported' });
    let cancelled = false;
    (async () => {
      try {
        const p = await navigator.permissions?.query({ name: 'camera' as PermissionName });
        if (cancelled) return;
        if (p?.state === 'granted') return setPhase({ k: 'scanning' });
        if (p?.state === 'denied') return setPhase({ k: 'camera', reason: 'denied' });
      } catch {
        /* API Permissions indisponible (anciens Safari) */
      }
      if (!cancelled) setPhase({ k: 'intro' });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const send = React.useCallback(async () => {
    const input = attempt.current;
    if (!input || inFlight.current) return;
    inFlight.current = true;
    setPhase({ k: 'sending' });
    try {
      const result = await postScan(input);
      if (result.status) qc.setQueryData(clockKeys.status, result.status);
      void qc.invalidateQueries({ queryKey: clockKeys.all });
      void qc.invalidateQueries({ queryKey: ['me'] });
      void qc.invalidateQueries({ queryKey: ['notifications'] });
      attempt.current = null;
      vibrate(120);
      if (mounted.current) setPhase({ k: 'success', result });
    } catch (e) {
      vibrate([80, 60, 80]);
      if (!mounted.current) return;
      if (isApiError(e) && e.status === 0) {
        setPhase({ k: 'network' }); // on garde la même idempotencyKey pour le renvoi
      } else {
        attempt.current = null;
        setPhase({ k: 'error', error: isApiError(e) ? e : new ApiError(0, 'ERREUR', 'Une erreur inattendue est survenue.') });
      }
    } finally {
      inFlight.current = false;
    }
  }, [qc]);

  const onDecode = React.useCallback(
    (text: string) => {
      if (!action || attempt.current || inFlight.current) return;
      attempt.current = { action, qrPayload: text, idempotencyKey: uuid(), clientTime: new Date().toISOString() };
      void send();
    },
    [action, send],
  );

  const restartScan = () => {
    attempt.current = null;
    setCameraReady(false);
    setScanSession((n) => n + 1);
    setPhase({ k: 'scanning' });
  };

  if (!action) return <Navigate to="/app" replace />;
  const copy = ACTION_COPY[action];

  if (phase.k === 'success') return <ScanSuccess action={action} result={phase.result} onHome={goHome} />;
  if (phase.k === 'error') return <ScanError error={phase.error} onRetry={restartScan} onHome={goHome} />;
  if (phase.k === 'network') return <ScanNetworkError sending={false} onResend={() => void send()} onHome={goHome} />;

  return (
    <FullDark title={copy.title} onBack={goHome}>
      <div className="sr-only" aria-live="polite">
        {phase.k === 'sending' ? 'Envoi du pointage en cours.' : phase.k === 'scanning' && cameraReady ? 'Caméra active, visez le QR Code.' : ''}
      </div>

      {phase.k === 'checking' && (
        <div className="flex flex-1 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-slate-400" aria-label="Chargement" /></div>
      )}

      {phase.k === 'intro' && (
        <div className="flex flex-1 flex-col">
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-brand/20 ring-1 ring-brand/40">
              <Camera className="h-9 w-9 text-brand-200" aria-hidden />
            </span>
            <h2 className="mt-5 text-xl font-semibold">Autoriser la caméra</h2>
            <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-slate-300">
              Pour pointer, l'application doit lire le QR Code affiché sur la borne. Votre navigateur va vous demander l'accès à la caméra : choisissez <span className="font-semibold text-white">« Autoriser »</span>.
            </p>
            <ul className="mt-5 space-y-2 text-left text-sm text-slate-400">
              <li className="flex items-start gap-2"><Smartphone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />Aucune photo n'est enregistrée ni envoyée.</li>
              <li className="flex items-start gap-2"><ScanLine className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />La caméra s'éteint dès que le code est lu.</li>
            </ul>
          </div>
          <Button size="xl" block leftIcon={<Camera />} onClick={() => setPhase({ k: 'scanning' })}>
            Activer la caméra
          </Button>
          <HelpDisclosure />
        </div>
      )}

      {phase.k === 'camera' && <CameraProblem reason={phase.reason} onRetry={restartScan} />}

      {(phase.k === 'scanning' || phase.k === 'sending') && (
        <div className="flex flex-1 flex-col">
          <p className="mb-4 text-center text-[15px] text-slate-300">{copy.hint}</p>
          <div className="relative">
            {phase.k === 'scanning' ? (
              <QrScanner
                key={scanSession}
                onReady={() => setCameraReady(true)}
                onDecode={onDecode}
                onError={(reason) => setPhase({ k: 'camera', reason })}
              />
            ) : (
              <div className="aspect-square w-full rounded-2xl bg-black/60" />
            )}
            {phase.k === 'scanning' && !cameraReady && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl bg-black/70 text-sm text-slate-300">
                <Loader2 className="h-7 w-7 animate-spin" aria-hidden /> Démarrage de la caméra…
              </div>
            )}
            {phase.k === 'sending' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl text-base font-medium">
                <Loader2 className="h-10 w-10 animate-spin" aria-hidden />
                Envoi du pointage…
              </div>
            )}
          </div>
          <p className="mt-4 text-center text-sm text-slate-400">La détection est automatique : gardez le code dans le cadre.</p>
          <div className="flex-1" />
          <HelpDisclosure />
        </div>
      )}
    </FullDark>
  );
}
