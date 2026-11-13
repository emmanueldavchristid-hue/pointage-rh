import {
  ANOMALY_STATUS, CLOCK_STATE, DAY_STATUS, EMPLOYEE_STATUS, LEAVE_STATUS, REVIEW_STATUS, SEVERITY,
  type LabelDef, type Tone,
} from '@/lib/labels';
import { Badge, type BadgeProps } from './badge';

export type StatusKind = 'state' | 'day' | 'leave' | 'anomaly' | 'severity' | 'review' | 'employee';

const DICTS: Record<StatusKind, Record<string, LabelDef>> = {
  state: CLOCK_STATE,
  day: DAY_STATUS,
  leave: LEAVE_STATUS,
  anomaly: ANOMALY_STATUS,
  severity: SEVERITY,
  review: REVIEW_STATUS,
  employee: EMPLOYEE_STATUS,
};

const toneToVariant: Record<Tone, NonNullable<BadgeProps['variant']>> = {
  neutral: 'neutral', info: 'info', success: 'success', warning: 'warning', danger: 'danger', brand: 'brand', muted: 'muted',
};

export interface StatusBadgeProps extends Omit<BadgeProps, 'variant' | 'children'> {
  kind: StatusKind;
  value?: string | null;
}

/** Badge d'état métier avec libellé FR : <StatusBadge kind="day" value={a.dayStatus} />. */
export function StatusBadge({ kind, value, dot = true, ...props }: StatusBadgeProps) {
  if (!value) return <span className="text-slate-400">—</span>;
  const def = DICTS[kind][value];
  const label = def?.label ?? value.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase());
  const variant = toneToVariant[def?.tone ?? 'neutral'];
  return (
    <Badge variant={variant} dot={dot} {...props} className={value === 'CRITIQUE' ? 'border-red-600 bg-red-600 text-white' : props.className}>
      {label}
    </Badge>
  );
}
