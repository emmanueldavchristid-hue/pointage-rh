import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

export const badgeVariants = cva(
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium leading-5',
  {
    variants: {
      variant: {
        neutral: 'border-slate-200 bg-slate-50 text-slate-700',
        muted: 'border-slate-200 bg-white text-slate-500',
        outline: 'border-slate-300 bg-transparent text-slate-700',
        brand: 'border-brand-200 bg-brand-50 text-brand-700',
        info: 'border-sky-200 bg-sky-50 text-sky-700',
        success: 'border-success-border bg-success-soft text-green-700',
        warning: 'border-warning-border bg-warning-soft text-warning-strong',
        danger: 'border-danger-border bg-danger-soft text-red-700',
        dark: 'border-ink bg-ink text-white',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

const dotColor: Record<string, string> = {
  neutral: 'bg-slate-400', muted: 'bg-slate-300', outline: 'bg-slate-400', brand: 'bg-brand', info: 'bg-sky-500',
  success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger', dark: 'bg-white',
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {
  /** Affiche une pastille colorée avant le texte. */
  dot?: boolean;
}

export function Badge({ className, variant, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', dotColor[variant ?? 'neutral'])} aria-hidden />}
      {children}
    </span>
  );
}
