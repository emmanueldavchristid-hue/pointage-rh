import * as React from 'react';
import {
  AlertTriangle, CalendarCheck, CalendarOff, Clock, Hourglass, Percent, Timer, UserCheck, UserX, Users, AlertCircle,
} from 'lucide-react';
import { Card, DateRangePicker, KpiCard, PageHeader, Select } from '@/components/ui';
import { addDaysISO, formatDateLong, formatNumber, formatPercent, monthRange, currentMonthISO, todayISO } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useAuth } from '@/features/auth/AuthProvider';
import { useCharts, useKpis } from '@/features/dashboard/api';
import {
  AbsenceBreakdownChart, LateMonthlyChart, OvertimeByDepartmentChart, PresenceByDepartmentChart, PresenceDailyChart, PresenceRateChart,
} from '@/features/dashboard/components/Charts';
import { useDepartmentOptions } from '@/features/org/api';
import { QueryError, useIsHR } from '@/features/org/components/shared';
import { useUrlState } from '@/features/org/useUrlState';

type Period = 'today' | '7d' | '30d' | 'month' | 'custom';
const PERIODS: { value: Period; label: string }[] = [
  { value: 'today', label: "Aujourd'hui" },
  { value: '7d', label: '7 jours' },
  { value: '30d', label: '30 jours' },
  { value: 'month', label: 'Ce mois' },
  { value: 'custom', label: 'Personnalisé' },
];

function rangeFor(p: Period, custom: { from: string; to: string }) {
  const t = todayISO();
  switch (p) {
    case 'today': return { from: t, to: t };
    case '7d': return { from: addDaysISO(t, -6), to: t };
    case '30d': return { from: addDaysISO(t, -29), to: t };
    case 'month': { const m = monthRange(currentMonthISO()); return { from: m.from, to: t < m.to ? t : m.to }; }
    default: return { from: custom.from || addDaysISO(t, -6), to: custom.to || t };
  }
}

export default function AdminDashboardPage() {
  const { user, company } = useAuth();
  const isHR = useIsHR();
  const defaults = React.useMemo(() => ({ period: '7d', from: '', to: '', departmentId: '' }), []);
  const { values: f, set } = useUrlState(defaults);
  const period = (f.period as Period) || '7d';
  const range = rangeFor(period, { from: f.from, to: f.to });
  // Graphiques : au minimum 7 jours pour lisibilité lorsque la période est « aujourd'hui ».
  const chartRange = period === 'today' ? { from: addDaysISO(range.to, -6), to: range.to } : range;
  const kpiDate = range.to;
  const isToday = kpiDate === todayISO();
  const deptOptions = useDepartmentOptions();
  const kpis = useKpis({ date: isToday ? undefined : kpiDate, departmentId: f.departmentId });
  const charts = useCharts({ ...chartRange, departmentId: f.departmentId });
  const k = kpis.data;
  const loading = kpis.isLoading;
  const dateQ = isToday ? '' : `&date=${kpiDate}`;
  const live = (tab: string) => `/admin/live?tab=${tab}${dateQ}${f.departmentId ? `&departmentId=${f.departmentId}` : ''}`;
  const first = user?.employee?.firstNames?.split(' ')[0];

  return (
    <div>
      <PageHeader
        title={first ? `Bonjour ${first}` : 'Tableau de bord'}
        description={`${company?.name ? `${company.name} · ` : ''}${formatDateLong(todayISO())}`}
      />

      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div role="radiogroup" aria-label="Période" className="inline-flex w-full overflow-x-auto rounded-lg bg-slate-100 p-1 sm:w-auto">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              role="radio"
              aria-checked={period === p.value}
              onClick={() => set({ period: p.value, ...(p.value === 'custom' ? { from: range.from, to: range.to } : { from: '', to: '' }) })}
              className={cn(
                'min-h-[36px] flex-1 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 sm:flex-none',
                period === p.value ? 'bg-white text-ink shadow-xs' : 'text-muted hover:text-ink',
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {period === 'custom' && <DateRangePicker from={f.from} to={f.to} onChange={(r) => set({ from: r.from, to: r.to })} />}
          {isHR && (
            <Select value={f.departmentId} onValueChange={(v) => set({ departmentId: v })} options={deptOptions} allLabel="Tous les départements" className="w-[220px]" aria-label="Département" />
          )}
        </div>
      </div>

      <section aria-label="Indicateurs clés" className="mb-6">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-ink">Situation {isToday ? "du jour" : `au ${kpiDate.split('-').reverse().join('/')}`}</h2>
          {k && <span className="text-xs text-muted">Actualisation automatique chaque minute</span>}
        </div>
        {kpis.error && !k ? (
          <Card><QueryError error={kpis.error} onRetry={kpis.refetch} compact label="Indicateurs" /></Card>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
            <KpiCard label="Employés actifs" value={formatNumber(k?.activeEmployees)} icon={Users} tone="neutral" loading={loading} to="/admin/employees" />
            <KpiCard label="Présents" value={formatNumber(k?.presentToday)} icon={UserCheck} tone="success" loading={loading} to={live('present')} />
            <KpiCard label="Taux de présence" value={formatPercent(k?.presenceRate)} icon={Percent} tone="brand" loading={loading}
              to={isHR ? `/admin/attendance?date=${kpiDate}${f.departmentId ? `&departmentId=${f.departmentId}` : ''}` : live('present')} />
            <KpiCard label="En retard" value={formatNumber(k?.lateToday)} icon={Clock} tone="warning" loading={loading} to={live('late')} />
            <KpiCard label="Absents" value={formatNumber(k?.absentToday)} icon={UserX} tone="danger" loading={loading} to={live('absent')} />
            <KpiCard label="Pas encore arrivés" value={formatNumber(k?.notArrivedYet)} icon={Hourglass} tone="neutral" loading={loading} to={live('notArrived')} />
            <KpiCard label="En congé" value={formatNumber(k?.onLeave)} icon={CalendarOff} tone="brand" loading={loading} to={live('onLeave')} />
            <KpiCard label="Pointages incomplets" value={formatNumber(k?.incomplete)} icon={AlertCircle} tone="warning" loading={loading}
              to={isHR ? `/admin/attendance?dayStatus=INCOMPLET&from=${addDaysISO(kpiDate, -29)}&to=${kpiDate}` : live('incomplete')} />
            <KpiCard label="Anomalies ouvertes" value={formatNumber(k?.openAnomalies)} icon={AlertTriangle} tone="danger" loading={loading} to="/admin/anomalies?status=OUVERTE" />
            <KpiCard label="HS en attente" value={formatNumber(k?.overtimePending)} icon={Timer} tone="neutral" loading={loading} to="/admin/overtime" />
            {k?.pendingLeaves !== undefined && (
              <KpiCard label="Congés à traiter" value={formatNumber(k.pendingLeaves)} icon={CalendarCheck} tone="brand" loading={loading} to="/admin/leaves" />
            )}
          </div>
        )}
      </section>

      <section aria-label="Graphiques" className="space-y-1">
        <h2 className="mb-3 text-sm font-semibold text-ink">
          Tendances du {chartRange.from.split('-').reverse().join('/')} au {chartRange.to.split('-').reverse().join('/')}
        </h2>
        {charts.error && !charts.data ? (
          <Card><QueryError error={charts.error} onRetry={charts.refetch} label="Graphiques" /></Card>
        ) : (
          <div className="grid gap-4 xl:grid-cols-3">
            <PresenceDailyChart data={charts.data} loading={charts.isLoading} />
            <PresenceRateChart data={charts.data} loading={charts.isLoading} />
            <LateMonthlyChart data={charts.data} loading={charts.isLoading} />
            <AbsenceBreakdownChart data={charts.data} loading={charts.isLoading} />
            <PresenceByDepartmentChart data={charts.data} loading={charts.isLoading} />
            <div className="xl:col-span-3"><OvertimeByDepartmentChart data={charts.data} loading={charts.isLoading} /></div>
          </div>
        )}
      </section>
    </div>
  );
}
