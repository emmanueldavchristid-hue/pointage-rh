import * as React from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

export type CameraErrorKind = 'denied' | 'no-camera' | 'busy' | 'unknown';

/** Classe l'erreur renvoyée par getUserMedia / html5-qrcode. */
export function classifyCameraError(err: unknown): CameraErrorKind {
  const e = err as { name?: string; message?: string } | string | undefined;
  const s = typeof e === 'string' ? e : `${e?.name ?? ''} ${e?.message ?? ''} ${String(err)}`;
  if (/NotAllowed|Permission|denied|SecurityError/i.test(s)) return 'denied';
  if (/NotFound|DevicesNotFound|Requested device not found|Overconstrained|no camera/i.test(s)) return 'no-camera';
  if (/NotReadable|TrackStart|Could not start|in use|AbortError/i.test(s)) return 'busy';
  return 'unknown';
}

interface QrScannerProps {
  /** Appelé UNE seule fois : le scanner est déjà arrêté à ce moment-là. */
  onDecode: (text: string) => void;
  onError: (kind: CameraErrorKind, raw: unknown) => void;
  onReady?: () => void;
}

/**
 * Lecteur QR html5-qrcode en mode programmatique : caméra arrière, cadre carré, 10 i/s.
 * Verrou : arrêt immédiat au premier décodage. Libération complète de la caméra au démontage (iOS Safari).
 */
export function QrScanner({ onDecode, onError, onReady }: QrScannerProps) {
  const id = React.useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const elementId = `qr-reader-${id}`;
  const cbs = React.useRef({ onDecode, onError, onReady });
  cbs.current = { onDecode, onError, onReady };

  React.useEffect(() => {
    let disposed = false;
    let decoded = false;
    const scanner = new Html5Qrcode(elementId, {
      verbose: false,
      formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
      useBarCodeDetectorIfSupported: true,
    });

    const releaseTracks = () => {
      document.getElementById(elementId)?.querySelectorAll('video').forEach((v) => {
        const stream = v.srcObject as MediaStream | null;
        stream?.getTracks().forEach((t) => t.stop());
        v.srcObject = null;
      });
    };

    let stopping: Promise<void> | null = null;
    const safeStop = () => {
      if (!stopping) {
        stopping = (async () => {
          try {
            if (scanner.isScanning) await scanner.stop();
          } catch {
            /* déjà arrêté */
          }
          try {
            scanner.clear();
          } catch {
            /* rien à nettoyer */
          }
          releaseTracks();
        })();
      }
      return stopping;
    };

    const started = scanner.start(
      { facingMode: 'environment' },
      {
        fps: 10,
        aspectRatio: 1,
        disableFlip: true,
        qrbox: (w: number, h: number) => {
          const size = Math.max(160, Math.floor(Math.min(w, h) * 0.72));
          return { width: size, height: size };
        },
      },
      (text) => {
        if (decoded || disposed) return;
        decoded = true;
        void safeStop().then(() => {
          if (!disposed) cbs.current.onDecode(text);
        });
      },
      () => {
        /* aucune détection sur cette image : normal */
      },
    );

    started
      .then(() => {
        if (disposed) void safeStop();
        else cbs.current.onReady?.();
      })
      .catch((err) => {
        releaseTracks();
        if (!disposed) cbs.current.onError(classifyCameraError(err), err);
      });

    return () => {
      disposed = true;
      // Attendre la fin du démarrage éventuel avant d'arrêter, sinon la caméra reste allumée.
      void started.catch(() => undefined).finally(() => void safeStop());
    };
  }, [elementId]);

  return (
    <div
      id={elementId}
      className="qr-reader relative aspect-square w-full overflow-hidden rounded-2xl bg-black [&_video]:!h-full [&_video]:!w-full [&_video]:object-cover"
      aria-label="Aperçu de la caméra"
    />
  );
}
