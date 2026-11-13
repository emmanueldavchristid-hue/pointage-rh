import * as React from 'react';
import { cn } from '@/lib/utils';

export const inputBase =
  'flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-ink shadow-xs transition-colors placeholder:text-slate-400 hover:border-slate-300 focus-visible:border-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-60 aria-[invalid=true]:border-danger aria-[invalid=true]:focus-visible:ring-danger/20';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Icône placée à gauche dans le champ. */
  leftIcon?: React.ReactNode;
  /** Élément à droite (bouton, unité…). */
  rightSlot?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', leftIcon, rightSlot, ...props }, ref) => {
    if (!leftIcon && !rightSlot) {
      return <input ref={ref} type={type} className={cn(inputBase, className)} {...props} />;
    }
    return (
      <div className="relative w-full">
        {leftIcon && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 [&_svg]:size-4">
            {leftIcon}
          </span>
        )}
        <input
          ref={ref}
          type={type}
          className={cn(inputBase, leftIcon && 'pl-9', rightSlot && 'pr-11', className)}
          {...props}
        />
        {rightSlot && <span className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center">{rightSlot}</span>}
      </div>
    );
  },
);
Input.displayName = 'Input';
