import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatNumber } from '@/lib/format';
import { Button } from './button';
import { Select } from './select';

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  className?: string;
}

function pageList(page: number, last: number): (number | '…')[] {
  if (last <= 7) return Array.from({ length: last }, (_, i) => i + 1);
  const set = new Set([1, last, page, page - 1, page + 1]);
  const pages = [...set].filter((p) => p >= 1 && p <= last).sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  pages.forEach((p, i) => {
    if (i > 0 && p - pages[i - 1] > 1) out.push('…');
    out.push(p);
  });
  return out;
}

/** Pagination compatible avec les listes `{items,total,page,pageSize}` (page commence à 1). */
export function Pagination({ page, pageSize, total, onPageChange, onPageSizeChange, pageSizeOptions = [10, 25, 50, 100], className }: PaginationProps) {
  const last = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className={cn('flex flex-col items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm text-muted sm:flex-row', className)}>
      <div className="flex items-center gap-3">
        <span className="tabular">
          {formatNumber(from)}–{formatNumber(to)} sur {formatNumber(total)}
        </span>
        {onPageSizeChange && (
          <div className="flex items-center gap-2">
            <span className="hidden sm:inline">Par page</span>
            <Select
              className="h-8 w-[76px]"
              aria-label="Éléments par page"
              value={String(pageSize)}
              onValueChange={(v) => onPageSizeChange(Number(v))}
              options={pageSizeOptions.map((n) => ({ value: String(n), label: String(n) }))}
            />
          </div>
        )}
      </div>
      <nav className="flex items-center gap-1" aria-label="Pagination">
        <Button variant="ghost" size="icon-sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="Page précédente">
          <ChevronLeft />
        </Button>
        {pageList(page, last).map((p, i) =>
          p === '…' ? (
            <span key={`e${i}`} className="px-1.5 text-slate-400">…</span>
          ) : (
            <Button
              key={p}
              variant={p === page ? 'outline' : 'ghost'}
              size="icon-sm"
              className={cn('tabular', p === page && 'border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-50')}
              aria-current={p === page ? 'page' : undefined}
              onClick={() => onPageChange(p)}
            >
              {p}
            </Button>
          ),
        )}
        <Button variant="ghost" size="icon-sm" disabled={page >= last} onClick={() => onPageChange(page + 1)} aria-label="Page suivante">
          <ChevronRight />
        </Button>
      </nav>
    </div>
  );
}
