import { useParams } from 'react-router-dom';
import { ScanLine } from 'lucide-react';

/** /borne/:code?k=displayKey — écran fixe public affichant le QR de localisation tournant. */
export default function KioskPage() {
  const { code } = useParams();
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-ink px-6 text-center text-white">
      <span className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
        <ScanLine className="h-7 w-7 text-brand-500" />
      </span>
      <h1 className="text-2xl font-semibold tracking-tight">Borne de pointage</h1>
      <p className="mt-2 text-sm text-slate-400">Code : {code}</p>
      <p className="mt-8 text-sm text-slate-500">Écran en cours de construction.</p>
    </div>
  );
}
