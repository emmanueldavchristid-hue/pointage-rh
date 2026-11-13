import { Check, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface StepDef { key: string; label: string; icon: LucideIcon; done: boolean }

export function SetupStepper({ steps, current, onSelect }: { steps: StepDef[]; current: number; onSelect: (i: number) => void }) {
  return (
    <nav aria-label="Étapes de la configuration">
      <p className="mb-2 text-xs font-medium text-muted sm:hidden">Étape {current + 1} sur {steps.length} · {steps[current]?.label}</p>
      <ol className="flex items-center">
        {steps.map((s, i) => {
          const active = i === current;
          const Icon = s.icon;
          return (
            <li key={s.key} className={cn('flex items-center', i < steps.length - 1 && 'flex-1')}>
              <button
                type="button"
                onClick={() => onSelect(i)}
                aria-current={active ? 'step' : undefined}
                className="group flex min-h-[44px] items-center gap-2.5 rounded-lg pr-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
              >
                <span
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors',
                    active ? 'border-brand bg-brand text-white shadow-[0_0_0_4px_rgb(37_99_235/0.12)]'
                      : s.done ? 'border-success bg-success text-white'
                        : 'border-slate-200 bg-white text-slate-400 group-hover:border-slate-300',
                  )}
                >
                  {s.done && !active ? <Check className="h-4 w-4" strokeWidth={3} aria-hidden /> : <Icon className="h-4 w-4" aria-hidden />}
                </span>
                <span className="hidden text-left sm:block">
                  <span className="block text-[11px] font-medium uppercase tracking-wide text-slate-400">Étape {i + 1}</span>
                  <span className={cn('block text-sm font-medium', active ? 'text-ink' : 'text-slate-600')}>{s.label}</span>
                </span>
                <span className="sr-only">{s.done ? '(terminée)' : '(à faire)'}</span>
              </button>
              {i < steps.length - 1 && <span className={cn('mx-2 h-0.5 flex-1 rounded-full', s.done ? 'bg-success/60' : 'bg-slate-200')} aria-hidden />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
