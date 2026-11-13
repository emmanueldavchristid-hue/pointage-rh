import * as React from 'react';
import { cn } from '@/lib/utils';
import { inputBase } from './input';

export interface DatePickerProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
  /** 'YYYY-MM-DD' (ou 'YYYY-MM' si type="month", 'HH:mm' si type="time"). */
  value?: string;
  onChange?: (value: string) => void;
  type?: 'date' | 'month' | 'time' | 'datetime-local';
}

/** Champ date natif stylé (fonctionne hors ligne, clavier/mobile natifs). Compatible RHF via Controller ou register. */
export const DatePicker = React.forwardRef<HTMLInputElement, DatePickerProps>(
  ({ className, value, onChange, type = 'date', ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      lang="fr"
      value={value ?? ''}
      onChange={(e) => onChange?.(e.target.value)}
      className={cn(inputBase, 'tabular', className)}
      {...props}
    />
  ),
);
DatePicker.displayName = 'DatePicker';

/** Deux dates « du … au … ». */
export function DateRangePicker({
  from, to, onChange, className,
}: { from?: string; to?: string; onChange: (r: { from: string; to: string }) => void; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <DatePicker aria-label="Date de début" value={from} max={to || undefined} onChange={(v) => onChange({ from: v, to: to ?? '' })} className="w-[150px]" />
      <span className="text-sm text-muted">au</span>
      <DatePicker aria-label="Date de fin" value={to} min={from || undefined} onChange={(v) => onChange({ from: from ?? '', to: v })} className="w-[150px]" />
    </div>
  );
}
