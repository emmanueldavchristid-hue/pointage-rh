import * as React from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from './skeleton';

type Tone = 'brand' | 'success' | 'warning' | 'danger' | 'neutral';
const toneCls: Record<Tone, string> = {
  brand: 'bg-brand-50 text-brand',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning-strong',
  danger: 'bg-danger-soft text-danger',
  neutral: 'bg-slate-100 text-slate-600',
};

export interface StatCardProps {
  label: React.ReactNode;
  value: React.ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  /** Texte secondaire sous la valeur. */
  hint?: React.ReactNode;
  /** Variation (ex. +4.2) : positive = vert, négative = rouge (inverser avec invertTrend). */
  trend?: number | null;
  trendLabel?: string;
  invertTrend?: boolean;
  loading?: boolean;
  /** Rend la carte cliquable : lien interne ou callback. */
  to?: string;
  onClick?: () => void;
  className?: string;
}

export function StatCard({ label, value, icon: Icon, tone = 'brand', hint, trend, trendLabel, invertTrend, loading, to, onClick, className }: StatCardProps) {
  const interactive = !!(to || onClick);
  const cls = cn(
    'group block rounded-xl border border-slate-200 bg-white p-5 text-left shadow-card transition-colors',
    interactive && 'cursor-pointer hover:border-brand-200 hover:bg-brand-50/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30',
    className,
  );
  const positive = (trend ?? 0) >= 0;
  const good = invertTrend ? !positive : positive;

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm font-medium text-muted">{label}</span>
        {Icon && (
          <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', toneCls[tone])}>
            <Icon className="h-[18px] w-[18px]" />
          </span>
        )}
      </div>
      {loading ? (
        <div className="mt-2 space-y-2">
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-3.5 w-28" />
        </div>
      ) : (
        <>
          <div className="mt-1 text-[28px] font-semibold leading-tight tracking-tight text-ink tabular">{value}</div>
          {(trend !== undefined && trend !== null) || hint ? (
            <div className="mt-1.5 flex items-center gap-2 text-xs">
              {trend !== undefined && trend !== null && (
                <span className={cn('inline-flex items-center gap-0.5 font-medium', good ? 'text-green-700' : 'text-red-700')}>
                  {positive ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                  {positive ? '+' : ''}{String(trend).replace('.', ',')}{trendLabel ?? ''}
                </span>
              )}
              {hint && <span className="text-muted">{hint}</span>}
            </div>
          ) : null}
        </>
      )}
    </>
  );

  if (to) return <Link to={to} className={cls}>{body}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={cn(cls, 'w-full')}>{body}</button>;
  return <div className={cls}>{body}</div>;
}

/** Alias */
export const KpiCard = StatCard;
