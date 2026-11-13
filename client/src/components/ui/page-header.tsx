import * as React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Boutons à droite. */
  actions?: React.ReactNode;
  /** Lien retour (ex. '/admin/employees'). */
  backTo?: string;
  backLabel?: string;
  /** Contenu sous le titre (onglets, badges…). */
  children?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, description, actions, backTo, backLabel = 'Retour', children, className }: PageHeaderProps) {
  return (
    <div className={cn('mb-6 space-y-4', className)}>
      {backTo && (
        <Link to={backTo} className="inline-flex items-center gap-1.5 rounded text-sm font-medium text-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30">
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </Link>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
          {description && <p className="text-sm text-muted">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}
