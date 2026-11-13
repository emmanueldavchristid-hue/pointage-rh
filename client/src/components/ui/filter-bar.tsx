import * as React from 'react';
import { FilterX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';

export interface FilterBarProps {
  /** Généralement un <SearchInput/> placé en premier. */
  search?: React.ReactNode;
  /** Filtres (Select, DatePicker…). */
  children?: React.ReactNode;
  /** Actions à droite (export…). */
  actions?: React.ReactNode;
  /** Affiche « Réinitialiser » si fourni et `canReset`. */
  onReset?: () => void;
  canReset?: boolean;
  className?: string;
}

export function FilterBar({ search, children, actions, onReset, canReset, className }: FilterBarProps) {
  return (
    <div className={cn('flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center', className)}>
      {search && <div className="w-full lg:max-w-xs">{search}</div>}
      <div className="flex flex-1 flex-wrap items-center gap-2 [&>*]:min-w-[160px] [&>*]:flex-1 sm:[&>*]:flex-none">{children}</div>
      {(actions || (onReset && canReset)) && (
        <div className="flex items-center gap-2">
          {onReset && canReset && (
            <Button variant="ghost" size="sm" onClick={onReset} leftIcon={<FilterX />}>Réinitialiser</Button>
          )}
          {actions}
        </div>
      )}
    </div>
  );
}
