import * as React from 'react';
import { AlertCircle, Inbox, RotateCw, WifiOff, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ApiError, errorMessage } from '@/lib/api';
import { Button } from './button';

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  /** compact = moins de marge (dans une carte / un tableau). */
  compact?: boolean;
}

export function EmptyState({ icon: Icon = Inbox, title, description, action, className, compact }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'px-4 py-10' : 'px-6 py-16', className)}>
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 shadow-xs">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="text-[15px] font-semibold text-ink">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm leading-relaxed text-muted">{description}</p>}
      {action && <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{action}</div>}
    </div>
  );
}

export interface ErrorStateProps {
  error?: unknown;
  title?: string;
  onRetry?: () => void;
  className?: string;
  compact?: boolean;
}

/** Affiche une erreur de chargement (message API en français) avec bouton Réessayer. */
export function ErrorState({ error, title, onRetry, className, compact }: ErrorStateProps) {
  const network = error instanceof ApiError && error.status === 0;
  const forbidden = error instanceof ApiError && error.status === 403;
  const Icon = network ? WifiOff : AlertCircle;
  return (
    <div className={cn('flex flex-col items-center justify-center text-center', compact ? 'px-4 py-10' : 'px-6 py-16', className)} role="alert">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-danger-border bg-danger-soft text-danger">
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="text-[15px] font-semibold text-ink">
        {title ?? (network ? 'Serveur injoignable' : forbidden ? 'Accès refusé' : 'Impossible de charger les données')}
      </h3>
      <p className="mt-1 max-w-sm text-sm text-muted">{errorMessage(error)}</p>
      {onRetry && !forbidden && (
        <Button variant="outline" size="sm" className="mt-5" onClick={onRetry} leftIcon={<RotateCw />}>
          Réessayer
        </Button>
      )}
    </div>
  );
}
