import * as React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { cn } from '@/lib/utils';

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverClose = PopoverPrimitive.Close;

export const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = 'center', sideOffset = 8, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn('z-50 w-72 rounded-xl border border-slate-200 bg-white p-4 text-ink shadow-pop outline-none animate-zoom-in', className)}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = 'PopoverContent';
