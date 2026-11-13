import * as React from 'react';
import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { Check, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      'peer h-[18px] w-[18px] shrink-0 rounded-[5px] border border-slate-300 bg-white shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-brand data-[state=checked]:bg-brand data-[state=indeterminate]:border-brand data-[state=indeterminate]:bg-brand data-[state=checked]:text-white data-[state=indeterminate]:text-white',
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="flex items-center justify-center">
      {props.checked === 'indeterminate' ? <Minus className="h-3.5 w-3.5" strokeWidth={3} /> : <Check className="h-3.5 w-3.5" strokeWidth={3} />}
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = 'Checkbox';
