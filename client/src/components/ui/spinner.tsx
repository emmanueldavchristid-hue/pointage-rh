import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SpinnerProps { className?: string; size?: 'sm' | 'md' | 'lg'; label?: string }

const sizes = { sm: 'h-4 w-4', md: 'h-5 w-5', lg: 'h-8 w-8' };

export function Spinner({ className, size = 'md', label = 'Chargement' }: SpinnerProps) {
  return (
    <span role="status" aria-label={label} className="inline-flex">
      <Loader2 className={cn('animate-spin text-brand', sizes[size], className)} aria-hidden />
    </span>
  );
}

/** Spinner centré pleine zone (chargement de page). */
export function PageLoader({ label = 'Chargement…' }: { label?: string }) {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-sm text-muted">
      <Spinner size="lg" />
      <span>{label}</span>
    </div>
  );
}
