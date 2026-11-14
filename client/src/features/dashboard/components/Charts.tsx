import * as React from 'react';
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps,
} from 'recharts';
import { BarChart3 } from 'lucide-react';
import { Card, CardContent, CardHeader, EmptyState, Skeleton } from '@/components/ui';
import { DAY_STATUS, labelOf } from '@/lib/labels';
import { formatDayShort, formatDuration, formatMonth, formatNumber } from '@/lib/format';
import type { DashboardCharts } from '../api';

/** Palette validée (CVD / contraste) : présents, retards, absents. */
export const C = { present: '#2563EB', late: '#F59E0B', absent: '#DC2626', single: '#2563EB', grid: '#EEF2F6', axis: '#64748B' };

type TipProps = TooltipContentProps<any, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const axisProps = { tick: { fill: C.axis, fontSize: 12 }, tickLine: false, axisLine: false } as const;

/** Normalise un taux (0–1 ou 0–100) en pourcentage. */
export function toPct(values: number[]) {
  const frac = values.length > 0 && values.every((v) => v <= 1);
  return (v: number) => (frac ? v * 100 : v);
}

const shortDay = (d: string) => {
  const [, m, day] = d.split('-');
  return `${day}/${m}`;
};
const shortMonth = (m: string) => new Intl.DateTimeFormat('fr-FR', { month: 'short', timeZone: 'UTC' }).format(new Date(`${m.slice(0, 7)}-15T12:00:00Z`));

function TooltipBox({ title, rows }: { title: React.ReactNode; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="min-w-[160px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-pop">
      <div className="mb-1 font-medium text-ink">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-4 py-0.5">
          <span className="inline-flex items-center gap-1.5 text-muted">
            {r.color && <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: r.color }} aria-hidden />}
            {r.label}
          </span>
          <span className="font-medium tabular text-ink">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-muted">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: i.color }} aria-hidden />{i.label}</span>
      ))}
    </div>
  );
}

export function ChartCard({
  title, description, loading, empty, children, legend, className, height = 260,
}: { title: string; description?: string; loading?: boolean; empty?: boolean; children: React.ReactNode; legend?: React.ReactNode; className?: string; height?: number }) {
  return (
    <Card className={className}>
      <CardHeader title={title} description={description} actions={legend} />
      <CardContent>
        <div style={{ height }}>
          {loading ? <Skeleton className="h-full w-full" />
            : empty ? <EmptyState compact icon={BarChart3} title="Aucune donnée sur la période" className="h-full" />
            : <ResponsiveContainer width="100%" height="100%">{children as React.ReactElement}</ResponsiveContainer>}
        </div>
      </CardContent>
    </Card>
  );
}

type D = DashboardCharts | undefined;

export function PresenceDailyChart({ data, loading }: { data: D; loading: boolean }) {
  // « present » inclut déjà les retards : la barre empile « à l'heure » + « retards » + « absents » sans double compte.
  const rows = (data?.presenceDaily ?? []).map((r) => ({ ...r, onTime: r.onTime ?? Math.max(0, r.present - r.late) }));
  const empty = !rows.some((r) => r.present + r.absent > 0);
  return (
    <ChartCard
      title="Présences par jour"
      description="Présents à l'heure, retards et absences"
      loading={loading}
      empty={empty}
      legend={<Legend items={[{ label: "À l'heure", color: C.present }, { label: 'Retards', color: C.late }, { label: 'Absents', color: C.absent }]} />}
      className="xl:col-span-2"
    >
      <BarChart data={rows} margin={{ top: 8, right: 4, left: -16, bottom: 0 }} barCategoryGap="20%">
        <CartesianGrid vertical={false} stroke={C.grid} />
        <XAxis dataKey="date" tickFormatter={shortDay} {...axisProps} minTickGap={12} />
        <YAxis allowDecimals={false} {...axisProps} />
        <Tooltip
          cursor={{ fill: 'rgba(148,163,184,0.12)' }}
          content={({ active, payload, label }: TipProps) => active && payload?.length ? (
            <TooltipBox title={formatDayShort(String(label))} rows={[
              { label: "Présents à l'heure", value: formatNumber(payload[0]?.payload.onTime), color: C.present },
              { label: 'Retards', value: formatNumber(payload[0]?.payload.late), color: C.late },
              { label: 'Absents', value: formatNumber(payload[0]?.payload.absent), color: C.absent },
            ]} />
          ) : null}
        />
        <Bar dataKey="onTime" stackId="p" fill={C.present} stroke="#fff" strokeWidth={1} name="Présents à l'heure" />
        <Bar dataKey="late" stackId="p" fill={C.late} stroke="#fff" strokeWidth={1} name="Retards" />
        <Bar dataKey="absent" stackId="p" fill={C.absent} stroke="#fff" strokeWidth={1} radius={[4, 4, 0, 0]} name="Absents" />
      </BarChart>
    </ChartCard>
  );
}

export function PresenceRateChart({ data, loading }: { data: D; loading: boolean }) {
  const raw = data?.presenceRateTrend ?? [];
  const norm = toPct(raw.map((r) => r.rate));
  const rows = raw.map((r) => ({ date: r.date, rate: Math.round(norm(r.rate) * 10) / 10 }));
  return (
    <ChartCard title="Taux de présence" description="Évolution quotidienne" loading={loading} empty={!rows.length}>
      <LineChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke={C.grid} />
        <XAxis dataKey="date" tickFormatter={shortDay} {...axisProps} minTickGap={16} />
        <YAxis domain={[0, 100]} tickFormatter={(v) => `${v} %`} {...axisProps} width={48} ticks={[0, 25, 50, 75, 100]} />
        <Tooltip
          cursor={{ stroke: '#CBD5E1', strokeWidth: 1 }}
          content={({ active, payload, label }: TipProps) => active && payload?.length ? (
            <TooltipBox title={formatDayShort(String(label))} rows={[{ label: 'Taux de présence', value: `${String(payload[0].value).replace('.', ',')} %`, color: C.single }]} />
          ) : null}
        />
        <Line type="linear" dataKey="rate" stroke={C.single} strokeWidth={2} dot={rows.length <= 10 ? { r: 3, fill: C.single, stroke: '#fff', strokeWidth: 2 } : false} activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2 }} />
      </LineChart>
    </ChartCard>
  );
}

export function LateMonthlyChart({ data, loading }: { data: D; loading: boolean }) {
  const rows = data?.lateMonthly ?? [];
  return (
    <ChartCard title="Retards par mois" description="Nombre de retards constatés" loading={loading} empty={!rows.length}>
      <BarChart data={rows} margin={{ top: 8, right: 4, left: -16, bottom: 0 }} barCategoryGap="30%">
        <CartesianGrid vertical={false} stroke={C.grid} />
        <XAxis dataKey="month" tickFormatter={shortMonth} {...axisProps} />
        <YAxis allowDecimals={false} {...axisProps} />
        <Tooltip
          cursor={{ fill: 'rgba(148,163,184,0.12)' }}
          content={({ active, payload, label }: TipProps) => active && payload?.length ? (
            <TooltipBox title={formatMonth(String(label))} rows={[
              { label: 'Retards', value: formatNumber(payload[0].payload.count), color: C.late },
              { label: 'Cumul', value: formatDuration(payload[0].payload.minutes, { zero: '0 min' }) },
            ]} />
          ) : null}
        />
        <Bar dataKey="count" fill={C.late} radius={[4, 4, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ChartCard>
  );
}

function HorizontalBars({
  title, description, rows, loading, format, color = C.single, domainMax,
}: { title: string; description?: string; rows: { name: string; value: number }[]; loading: boolean; format: (v: number) => string; color?: string; domainMax?: number }) {
  const height = Math.max(180, rows.length * 36 + 24);
  return (
    <ChartCard title={title} description={description} loading={loading} empty={!rows.length || rows.every((r) => !r.value)} height={height}>
      <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 48, left: 0, bottom: 0 }} barCategoryGap="28%">
        <CartesianGrid horizontal={false} stroke={C.grid} />
        <XAxis type="number" hide domain={[0, domainMax ?? 'auto']} />
        <YAxis type="category" dataKey="name" {...axisProps} width={130} tick={{ fill: '#334155', fontSize: 12 }} />
        <Tooltip
          cursor={{ fill: 'rgba(148,163,184,0.12)' }}
          content={({ active, payload }: TipProps) => active && payload?.length ? (
            <TooltipBox title={payload[0].payload.name} rows={[{ label: title, value: format(Number(payload[0].value)), color }]} />
          ) : null}
        />
        <Bar dataKey="value" fill={color} radius={[0, 4, 4, 0]} maxBarSize={22}
          label={{ position: 'right', fill: '#334155', fontSize: 12, formatter: (v: unknown) => format(Number(v)) }} />
      </BarChart>
    </ChartCard>
  );
}

export function AbsenceBreakdownChart({ data, loading }: { data: D; loading: boolean }) {
  const rows = (data?.absenceBreakdown ?? []).map((r) => ({ name: labelOf(DAY_STATUS, r.status), value: r.count })).sort((a, b) => b.value - a.value);
  return <HorizontalBars title="Répartition des absences" description="Journées par motif" rows={rows} loading={loading} format={(v) => formatNumber(v)} />;
}

export function PresenceByDepartmentChart({ data, loading }: { data: D; loading: boolean }) {
  const raw = data?.presenceByDepartment ?? [];
  const norm = toPct(raw.map((r) => r.rate));
  const rows = raw.map((r) => ({ name: r.department, value: Math.round(norm(r.rate) * 10) / 10 })).sort((a, b) => b.value - a.value);
  return <HorizontalBars title="Présence par département" description="Taux de présence sur la période" rows={rows} loading={loading} domainMax={100} format={(v) => `${String(v).replace('.', ',')} %`} />;
}

export function OvertimeByDepartmentChart({ data, loading }: { data: D; loading: boolean }) {
  const rows = (data?.overtimeByDepartment ?? []).map((r) => ({ name: r.department, value: Number(r.minutes ?? r.potentialMinutes ?? 0) })).sort((a, b) => b.value - a.value);
  return <HorizontalBars title="Heures sup. par département" description="Heures supplémentaires constatées sur la période" rows={rows} loading={loading} format={(v) => formatDuration(v, { zero: '0 min' })} />;
}
