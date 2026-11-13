import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronDown, Copy, Info, Search, ShieldAlert, Wrench, X, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import {
  Avatar, Button, Checkbox, EmptyState, ErrorState, Input, Popover, PopoverContent, PopoverTrigger, Select, Skeleton,
} from '@/components/ui';
import { api, isApiError } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { Employee, Paginated } from '@/lib/types';

// ---------------------------------------------------------------------------
// Référentiels communs (départements, employés)
// ---------------------------------------------------------------------------

export interface DepartmentLite {
  id: number;
  name: string;
  code: string;
  active: boolean;
  employeesCount?: number;
  managerName?: string | null;
}

export const lookupKeys = {
  departments: ['departments', 'list', { lookup: true }] as const,
  employees: (q: string) => ['employees', 'list', { lookup: true, q }] as const,
};

export function useDepartmentsLookup(enabled = true) {
  return useQuery({
    queryKey: lookupKeys.departments,
    queryFn: ({ signal }) => api.get<DepartmentLite[] | Paginated<DepartmentLite>>('/departments', undefined, signal),
    select: (d) => (Array.isArray(d) ? d : d.items).filter((x) => x.active !== false),
    staleTime: 5 * 60_000,
    enabled,
    meta: { silent: true },
  });
}

export function useEmployeesLookup(q = '', enabled = true) {
  return useQuery({
    queryKey: lookupKeys.employees(q),
    queryFn: ({ signal }) => api.get<Paginated<Employee>>('/employees', { q, pageSize: 100, status: 'ACTIVE' }, signal),
    select: (d) => d.items,
    staleTime: 60_000,
    enabled,
    meta: { silent: true },
  });
}

/** Select de département (valeur = id en chaîne, '' = tous). */
export function DepartmentSelect({
  value, onChange, allLabel = 'Tous les départements', className, placeholder = 'Département', id,
}: { value: string; onChange: (v: string) => void; allLabel?: string | null; className?: string; placeholder?: string; id?: string }) {
  const q = useDepartmentsLookup();
  return (
    <Select
      id={id}
      aria-label="Département"
      value={value}
      onValueChange={onChange}
      allLabel={allLabel ?? undefined}
      placeholder={q.isPending ? 'Chargement…' : placeholder}
      options={(q.data ?? []).map((d) => ({ value: String(d.id), label: d.name }))}
      className={className}
    />
  );
}

/** Sélecteur d'employé avec recherche (simple ou multiple). */
export function EmployeePicker({
  value, onChange, multiple = false, placeholder = 'Choisir un employé', className, id, invalid,
}: {
  value: number[];
  onChange: (ids: number[], employees: Employee[]) => void;
  multiple?: boolean;
  placeholder?: string;
  className?: string;
  id?: string;
  invalid?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [debounced, setDebounced] = React.useState('');
  const known = React.useRef(new Map<number, Employee>());
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);
  const q = useEmployeesLookup(debounced, open || value.length > 0);
  (q.data ?? []).forEach((e) => known.current.set(e.id, e));
  const selected = value.map((id) => known.current.get(id)).filter(Boolean) as Employee[];

  function toggle(e: Employee) {
    known.current.set(e.id, e);
    if (!multiple) {
      onChange([e.id], [e]);
      setOpen(false);
      return;
    }
    const next = value.includes(e.id) ? value.filter((v) => v !== e.id) : [...value, e.id];
    onChange(next, next.map((v) => known.current.get(v)).filter(Boolean) as Employee[]);
  }

  const label = selected.length === 0
    ? (value.length ? `${value.length} employé(s)` : placeholder)
    : multiple
      ? (selected.length === 1 ? selected[0].fullName : `${selected.length} employés sélectionnés`)
      : `${selected[0].fullName} · ${selected[0].matricule}`;

  return (
    <div className={cn('space-y-2', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            id={id}
            type="button"
            aria-invalid={invalid}
            aria-haspopup="listbox"
            className={cn(
              'flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 text-left text-sm shadow-xs transition-colors hover:border-slate-300 focus:outline-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/20 aria-[invalid=true]:border-danger',
              !value.length && 'text-slate-400',
            )}
          >
            <span className="truncate">{label}</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(420px,calc(100vw-2rem))] p-0">
          <div className="border-b border-slate-100 p-2">
            <Input autoFocus leftIcon={<Search />} placeholder="Nom ou matricule…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Rechercher un employé" />
          </div>
          <div className="max-h-72 overflow-y-auto p-1 scrollbar-thin" role="listbox" aria-multiselectable={multiple}>
            {q.isPending ? (
              <div className="space-y-2 p-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
            ) : q.isError ? (
              <p className="p-4 text-center text-sm text-muted">Impossible de charger les employés.</p>
            ) : (q.data ?? []).length === 0 ? (
              <p className="p-4 text-center text-sm text-muted">Aucun employé trouvé.</p>
            ) : (
              (q.data ?? []).map((e) => {
                const isSel = value.includes(e.id);
                return (
                  <button
                    key={e.id}
                    type="button"
                    role="option"
                    aria-selected={isSel}
                    onClick={() => toggle(e)}
                    className={cn('flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-slate-100', isSel && 'bg-brand-50/60')}
                  >
                    {multiple && <Checkbox checked={isSel} tabIndex={-1} aria-hidden className="pointer-events-none" />}
                    <Avatar name={e.fullName} size="xs" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-ink">{e.fullName}</span>
                      <span className="block truncate text-xs text-muted">{e.matricule}{e.departmentName ? ` · ${e.departmentName}` : ''}</span>
                    </span>
                    {!multiple && isSel && <Check className="h-4 w-4 text-brand" />}
                  </button>
                );
              })
            )}
          </div>
        </PopoverContent>
      </Popover>
      {multiple && selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((e) => (
            <span key={e.id} className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 py-0.5 pl-2.5 pr-1 text-xs font-medium text-brand-700">
              {e.fullName}
              <button type="button" onClick={() => toggle(e)} className="rounded-full p-0.5 hover:bg-brand-100" aria-label={`Retirer ${e.fullName}`}>
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Présentation
// ---------------------------------------------------------------------------

const calloutTones = {
  info: { box: 'border-brand-200 bg-brand-50/60 text-brand-800', icon: 'text-brand' },
  warning: { box: 'border-warning-border bg-warning-soft text-warning-strong', icon: 'text-warning-strong' },
  danger: { box: 'border-danger-border bg-danger-soft text-red-800', icon: 'text-danger' },
  neutral: { box: 'border-slate-200 bg-slate-50 text-slate-700', icon: 'text-slate-500' },
};

/** Encart d'information (explications métier, limites, sécurité). */
export function Callout({
  title, children, tone = 'info', icon, className,
}: { title?: React.ReactNode; children?: React.ReactNode; tone?: keyof typeof calloutTones; icon?: LucideIcon; className?: string }) {
  const Icon = icon ?? (tone === 'danger' || tone === 'warning' ? ShieldAlert : Info);
  const t = calloutTones[tone];
  return (
    <div className={cn('flex gap-3 rounded-xl border px-4 py-3 text-sm', t.box, className)} role="note">
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', t.icon)} />
      <div className="min-w-0 space-y-1 leading-relaxed">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="[&_p]:leading-relaxed">{children}</div>}
      </div>
    </div>
  );
}

/** Section de formulaire : titre + description à gauche, champs à droite (empilé sur mobile). */
export function FormSection({
  title, description, children, className,
}: { title: React.ReactNode; description?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('grid gap-4 border-b border-slate-100 py-6 first:pt-0 last:border-0 last:pb-0 lg:grid-cols-[260px_1fr] lg:gap-8', className)}>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        {description && <p className="text-[13px] leading-relaxed text-muted">{description}</p>}
      </div>
      <div className="min-w-0 space-y-4">{children}</div>
    </section>
  );
}

/** Erreur de chargement : une 404 « route inconnue » est présentée comme module en cours de déploiement. */
export function LoadError({ error, onRetry, compact }: { error: unknown; onRetry?: () => void; compact?: boolean }) {
  if (isApiError(error) && error.status === 404) {
    return (
      <EmptyState
        compact={compact}
        icon={Wrench}
        title="Module serveur pas encore disponible"
        description="Le service correspondant n'est pas encore activé sur le serveur. Réessayez dans quelques instants."
        action={onRetry ? <Button variant="outline" size="sm" onClick={onRetry}>Réessayer</Button> : undefined}
      />
    );
  }
  return <ErrorState error={error} onRetry={onRetry} compact={compact} />;
}

/** Bouton « Copier » (presse-papiers, avec repli pour HTTP non sécurisé). */
export function CopyButton({ text, label = 'Copier', size = 'sm', variant = 'outline' }: { text: string; label?: string; size?: 'sm' | 'icon-sm'; variant?: 'outline' | 'ghost' }) {
  const [done, setDone] = React.useState(false);
  async function copy() {
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
      else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      setDone(true);
      toast.success('Copié dans le presse-papiers.');
      setTimeout(() => setDone(false), 1500);
    } catch {
      toast.error('Copie impossible : sélectionnez le texte manuellement.');
    }
  }
  return (
    <Button type="button" variant={variant} size={size} onClick={copy} leftIcon={size === 'sm' ? (done ? <Check /> : <Copy />) : undefined} aria-label={label}>
      {size === 'sm' ? label : done ? <Check /> : <Copy />}
    </Button>
  );
}

/** Ligne libellé / valeur. */
export function DetailRow({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium text-ink">{children}</dd>
    </div>
  );
}

/** Chips de jours de la semaine (1 = lundi … 7 = dimanche). */
export function WeekdayChips({ value, onChange, disabled }: { value: number[]; onChange?: (v: number[]) => void; disabled?: boolean }) {
  const days = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Jours travaillés">
      {days.map((d, i) => {
        const n = i + 1;
        const on = value.includes(n);
        return (
          <button
            key={n}
            type="button"
            disabled={disabled}
            aria-pressed={on}
            onClick={() => onChange?.(on ? value.filter((x) => x !== n) : [...value, n].sort((a, b) => a - b))}
            className={cn(
              'h-9 min-w-[48px] rounded-lg border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 disabled:cursor-not-allowed disabled:opacity-60',
              on ? 'border-brand bg-brand text-white shadow-xs' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50',
            )}
          >
            {d}
          </button>
        );
      })}
    </div>
  );
}

/** Champ numérique avec unité à droite. */
export const NumberInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { unit?: string }>(
  ({ unit, className, ...props }, ref) => (
    <div className="relative">
      <Input ref={ref} type="number" inputMode="numeric" className={cn('tabular', unit && 'pr-14', className)} {...props} />
      {unit && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">{unit}</span>}
    </div>
  ),
);
NumberInput.displayName = 'NumberInput';

/** Petits blocs de chargement en liste. */
export function ListSkeleton({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-3', className)}>
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
    </div>
  );
}
