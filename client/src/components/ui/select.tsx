import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { Check, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

export const SelectRoot = SelectPrimitive.Root;
export const SelectGroup = SelectPrimitive.Group;
export const SelectValue = SelectPrimitive.Value;

export const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      'flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 text-left text-sm text-ink shadow-xs transition-colors hover:border-slate-300 focus:outline-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-60 data-[placeholder]:text-slate-400 aria-[invalid=true]:border-danger [&>span]:truncate',
      className,
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = 'SelectTrigger';

export const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = 'popper', ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      position={position}
      className={cn(
        'relative z-50 max-h-[min(24rem,var(--radix-select-content-available-height))] min-w-[8rem] overflow-hidden rounded-lg border border-slate-200 bg-white text-ink shadow-pop animate-zoom-in',
        position === 'popper' && 'w-full min-w-[var(--radix-select-trigger-width)] data-[side=bottom]:translate-y-1 data-[side=top]:-translate-y-1',
        className,
      )}
      {...props}
    >
      <SelectPrimitive.ScrollUpButton className="flex h-6 items-center justify-center text-slate-400">
        <ChevronUp className="h-4 w-4" />
      </SelectPrimitive.ScrollUpButton>
      <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
      <SelectPrimitive.ScrollDownButton className="flex h-6 items-center justify-center text-slate-400">
        <ChevronDown className="h-4 w-4" />
      </SelectPrimitive.ScrollDownButton>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = 'SelectContent';

export const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex w-full cursor-pointer select-none items-center rounded-md py-2 pl-8 pr-2 text-sm outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-slate-100 data-[disabled]:opacity-50',
      className,
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-4 w-4 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-4 w-4 text-brand" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = 'SelectItem';

export const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Label ref={ref} className={cn('px-2 py-1.5 text-xs font-semibold text-muted', className)} {...props} />
));
SelectLabel.displayName = 'SelectLabel';

export const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <SelectPrimitive.Separator ref={ref} className={cn('-mx-1 my-1 h-px bg-slate-100', className)} {...props} />
));
SelectSeparator.displayName = 'SelectSeparator';

/** Valeur spéciale pour « Tous » (Radix interdit value=""). */
export const ALL = '__all__';

export interface SelectOption { value: string; label: React.ReactNode; disabled?: boolean }

export interface SelectProps {
  value?: string;
  onValueChange?: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  /** Ajoute une option « Tous » qui renvoie '' via onValueChange. */
  allLabel?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  name?: string;
  'aria-invalid'?: boolean;
  'aria-label'?: string;
}

/** Select simple piloté par une liste d'options. Valeur vide = rien sélectionné / « Tous ». */
export const Select = React.forwardRef<HTMLButtonElement, SelectProps>(
  ({ value, onValueChange, options, placeholder = 'Sélectionner…', allLabel, disabled, className, id, name, ...aria }, ref) => {
    const v = value === '' || value === undefined || value === null ? (allLabel ? ALL : undefined) : value;
    return (
      <SelectRoot
        value={v}
        onValueChange={(nv) => onValueChange?.(nv === ALL ? '' : nv)}
        disabled={disabled}
        name={name}
      >
        <SelectTrigger ref={ref} id={id} className={className} {...aria}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {allLabel && <SelectItem value={ALL}>{allLabel}</SelectItem>}
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </SelectRoot>
    );
  },
);
Select.displayName = 'Select';
