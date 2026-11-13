import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-brand text-white shadow-xs hover:bg-brand-700 active:bg-brand-800',
        secondary: 'bg-brand-50 text-brand-700 hover:bg-brand-100',
        outline: 'border border-slate-200 bg-white text-ink shadow-xs hover:bg-slate-50 hover:border-slate-300',
        ghost: 'text-slate-700 hover:bg-slate-100 hover:text-ink',
        destructive: 'bg-danger text-white shadow-xs hover:bg-red-700 focus-visible:ring-danger/40',
        success: 'bg-success text-white shadow-xs hover:bg-green-700 focus-visible:ring-success/40',
        dark: 'bg-ink text-white shadow-xs hover:bg-ink-soft',
        link: 'h-auto px-0 text-brand underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 px-3 text-[13px]',
        default: 'h-10 px-4',
        lg: 'h-11 px-5 text-[15px]',
        xl: 'h-14 px-6 text-base rounded-xl',
        icon: 'h-10 w-10',
        'icon-sm': 'h-8 w-8',
      },
      block: { true: 'w-full' },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
  /** Icône Lucide affichée à gauche (remplacée par le spinner pendant loading). */
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, block, loading, disabled, leftIcon, rightIcon, children, type = 'button', ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size, block }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Loader2 className="animate-spin" aria-hidden /> : leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  ),
);
Button.displayName = 'Button';
