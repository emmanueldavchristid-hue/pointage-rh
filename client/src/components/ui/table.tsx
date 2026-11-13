import * as React from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Conteneur avec bordure + défilement horizontal. */
export const TableContainer = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card', className)} {...props} />
);

export const Table = React.forwardRef<HTMLTableElement, React.TableHTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className="relative w-full overflow-x-auto scrollbar-thin">
      <table ref={ref} className={cn('w-full caption-bottom border-collapse text-sm', className)} {...props} />
    </div>
  ),
);
Table.displayName = 'Table';

export const TableHeader = ({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <thead className={cn('bg-slate-50/80 [&_tr]:border-b [&_tr]:border-slate-200', className)} {...props} />
);
export const TableBody = ({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />
);
export const TableFooter = ({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) => (
  <tfoot className={cn('border-t border-slate-200 bg-slate-50/60 font-medium', className)} {...props} />
);

export const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement> & { clickable?: boolean; selected?: boolean }>(
  ({ className, clickable, selected, ...props }, ref) => (
    <tr
      ref={ref}
      data-state={selected ? 'selected' : undefined}
      className={cn(
        'border-b border-slate-100 transition-colors data-[state=selected]:bg-brand-50/60',
        clickable && 'cursor-pointer hover:bg-slate-50',
        className,
      )}
      {...props}
    />
  ),
);
TableRow.displayName = 'TableRow';

export type SortDirection = 'asc' | 'desc' | null;

export interface TableHeadProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  /** Rend l'en-tête triable : direction courante + callback. */
  sortable?: boolean;
  sortDirection?: SortDirection;
  onSort?: () => void;
  align?: 'left' | 'right' | 'center';
}

export function TableHead({ className, sortable, sortDirection, onSort, align = 'left', children, ...props }: TableHeadProps) {
  const alignCls = align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left';
  const Icon = sortDirection === 'asc' ? ArrowUp : sortDirection === 'desc' ? ArrowDown : ArrowUpDown;
  return (
    <th
      className={cn('h-10 whitespace-nowrap px-4 align-middle text-xs font-medium uppercase tracking-wide text-muted', alignCls, className)}
      aria-sort={sortDirection === 'asc' ? 'ascending' : sortDirection === 'desc' ? 'descending' : undefined}
      {...props}
    >
      {sortable ? (
        <button type="button" onClick={onSort} className={cn('inline-flex items-center gap-1 rounded hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30', align === 'right' && 'flex-row-reverse')}>
          {children}
          <Icon className={cn('h-3.5 w-3.5', !sortDirection && 'opacity-40')} />
        </button>
      ) : children}
    </th>
  );
}

export const TableCell = ({ className, align = 'left', ...props }: React.TdHTMLAttributes<HTMLTableCellElement> & { align?: 'left' | 'right' | 'center' }) => (
  <td
    className={cn('px-4 py-3 align-middle text-slate-700', align === 'right' && 'text-right tabular', align === 'center' && 'text-center', className)}
    {...props}
  />
);

export const TableCaption = ({ className, ...props }: React.HTMLAttributes<HTMLTableCaptionElement>) => (
  <caption className={cn('mt-4 text-sm text-muted', className)} {...props} />
);

/** Ligne pleine largeur (message vide / chargement à l'intérieur d'un tbody). */
export function TableEmptyRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="p-0">{children}</td>
    </tr>
  );
}
