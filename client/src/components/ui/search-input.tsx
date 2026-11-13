import * as React from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from './input';

export interface SearchInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: string;
  /** Appelé après `debounce` ms (défaut 300). */
  onChange: (value: string) => void;
  debounce?: number;
}

export function SearchInput({ value, onChange, debounce = 300, placeholder = 'Rechercher…', className, ...props }: SearchInputProps) {
  const [local, setLocal] = React.useState(value);
  const cb = React.useRef(onChange);
  cb.current = onChange;

  React.useEffect(() => setLocal(value), [value]);
  React.useEffect(() => {
    if (local === value) return;
    const t = setTimeout(() => cb.current(local), debounce);
    return () => clearTimeout(t);
  }, [local, value, debounce]);

  return (
    <Input
      type="search"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      leftIcon={<Search />}
      className={cn('w-full', className)}
      rightSlot={
        local ? (
          <button type="button" onClick={() => { setLocal(''); onChange(''); }} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-ink" aria-label="Effacer la recherche">
            <X className="h-3.5 w-3.5" />
          </button>
        ) : undefined
      }
      {...props}
    />
  );
}

/** Hook utilitaire : valeur « debouncée ». */
export function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setV(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return v;
}
