import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addMonthsISO, currentMonthISO, formatMonth } from '@/lib/format';

/** Navigation mois précédent / suivant (bloquée au mois courant si allowFuture = false). */
export function MonthNav({ month, onChange, allowFuture = false }: { month: string; onChange: (m: string) => void; allowFuture?: boolean }) {
  const isCurrent = month >= currentMonthISO();
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-1 shadow-xs">
      <button type="button" onClick={() => onChange(addMonthsISO(month, -1))} className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30" aria-label="Mois précédent">
        <ChevronLeft className="h-5 w-5" />
      </button>
      <div className="text-center">
        <p className="text-[15px] font-semibold text-ink" aria-live="polite">{formatMonth(month)}</p>
        {!isCurrent && (
          <button type="button" onClick={() => onChange(currentMonthISO())} className="text-xs font-medium text-brand hover:underline">
            Revenir au mois en cours
          </button>
        )}
      </div>
      <button type="button" onClick={() => onChange(addMonthsISO(month, 1))} disabled={!allowFuture && isCurrent} className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 disabled:pointer-events-none disabled:opacity-30" aria-label="Mois suivant">
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  );
}
