import * as React from 'react';
import { FileSpreadsheet, FileText, FileType2, Play, Sheet, TableProperties } from 'lucide-react';
import { toast } from 'sonner';
import {
  Badge, Button, Card, CardContent, DatePicker, EmptyState, FormField, PageHeader, Select, Skeleton, Table, TableBody,
  TableCell, TableContainer, TableHead, TableHeader, TableRow, TableSkeleton,
} from '@/components/ui';
import { DepartmentSelect, EmployeePicker, LoadError } from '@/features/admin/shared';
import { REPORTS, useReport, type ReportDef, type ReportFormat, type ReportParams } from '@/features/reports/api';
import { useAuth } from '@/features/auth/AuthProvider';
import { downloadFile, errorMessage } from '@/lib/api';
import { addDaysISO, formatDate, formatDateTime, formatDuration, formatNumber, monthRange, todayISO, currentMonthISO } from '@/lib/format';
import { DAY_STATUS, LEAVE_STATUS, ANOMALY_STATUS, REVIEW_STATUS, SEVERITY, CLOCK_STATE, labelOf, type LabelDef } from '@/lib/labels';
import { cn } from '@/lib/utils';

function defaultPeriod(def: ReportDef): { from: string; to: string } {
  const today = todayISO();
  if (def.period === 'day') return { from: today, to: today };
  if (def.period === 'week') {
    const wd = ((new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7);
    const from = addDaysISO(today, -wd);
    return { from, to: addDaysISO(from, 6) };
  }
  return monthRange(currentMonthISO());
}

const STATUS_DICTS: Record<string, LabelDef> = { ...DAY_STATUS, ...CLOCK_STATE, ...LEAVE_STATUS, ...ANOMALY_STATUS, ...REVIEW_STATUS, ...SEVERITY };

/** Rendu lisible d'une cellule selon sa clé et sa valeur. */
function renderCell(key: string, v: unknown): React.ReactNode {
  if (v === null || v === undefined || v === '') return <span className="text-slate-300">—</span>;
  if (typeof v === 'boolean') return v ? 'Oui' : 'Non';
  if (typeof v === 'number') {
    if (/minutes?$/i.test(key) || /Min$/.test(key)) return formatDuration(v);
    if (/rate|taux|percent/i.test(key)) return `${formatNumber(v <= 1 ? v * 100 : v, 1)} %`;
    return formatNumber(v, 2);
  }
  if (typeof v === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return formatDate(v);
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return formatDateTime(v);
    if (/^[A-Z_]{3,}$/.test(v) && STATUS_DICTS[v]) return <Badge variant="neutral">{labelOf(STATUS_DICTS, v)}</Badge>;
    return v;
  }
  if (Array.isArray(v)) return v.join(', ');
  return JSON.stringify(v);
}
const isNumericCol = (rows: Record<string, unknown>[], key: string) => rows.length > 0 && rows.every((r) => r[key] === null || r[key] === undefined || typeof r[key] === 'number');

export default function AdminReportsPage() {
  const { hasRole } = useAuth();
  const isManager = hasRole('MANAGER');
  const [def, setDef] = React.useState<ReportDef>(REPORTS[0]);
  const [period, setPeriod] = React.useState(() => defaultPeriod(REPORTS[0]));
  const [employee, setEmployee] = React.useState<number[]>([]);
  const [departmentId, setDepartmentId] = React.useState('');
  const [status, setStatus] = React.useState('');
  const [submitted, setSubmitted] = React.useState<ReportParams | null>(null);
  const [exporting, setExporting] = React.useState<ReportFormat | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const q = useReport(submitted ? def.type : null, submitted);

  function choose(d: ReportDef) {
    setDef(d);
    setPeriod(defaultPeriod(d));
    setStatus('');
    setSubmitted(null);
    setError(null);
  }

  function params(): ReportParams | null {
    if (!period.from || !period.to) { setError('Choisissez une période complète.'); return null; }
    if (period.to < period.from) { setError('La date de fin doit suivre la date de début.'); return null; }
    if (def.needsEmployee && !employee.length) { setError('Choisissez un employé pour ce rapport.'); return null; }
    setError(null);
    return {
      from: period.from, to: def.period === 'day' ? period.from : period.to,
      employeeId: employee[0] ? String(employee[0]) : undefined,
      departmentId: departmentId || undefined,
      status: status || undefined,
    };
  }

  async function exportAs(format: ReportFormat) {
    const p = params();
    if (!p) return;
    setExporting(format);
    try {
      await downloadFile(`/reports/${def.type}`, { ...p, format }, `rapport-${def.type}-${p.from}.${format}`);
      toast.success('Export téléchargé.');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setExporting(null);
    }
  }

  const data = q.data;
  return (
    <div>
      <PageHeader title="Rapports" description={`Aperçu à l'écran et export Excel, PDF ou CSV.${isManager ? ' Les données sont limitées à votre département.' : ''}`} />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5" role="radiogroup" aria-label="Type de rapport">
        {REPORTS.map((r) => {
          const active = r.type === def.type;
          return (
            <button key={r.type} type="button" role="radio" aria-checked={active} onClick={() => choose(r)}
              className={cn('flex flex-col rounded-xl border bg-white p-4 text-left shadow-card transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30',
                active ? 'border-brand ring-1 ring-brand' : 'border-slate-200 hover:border-brand-200')}>
              <span className={cn('mb-3 flex h-9 w-9 items-center justify-center rounded-lg', active ? 'bg-brand text-white' : 'bg-brand-50 text-brand')}><r.icon className="h-[18px] w-[18px]" /></span>
              <span className="text-sm font-semibold text-ink">{r.title}</span>
              <span className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted">{r.description}</span>
            </button>
          );
        })}
      </div>

      <Card className="mb-6">
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            {def.period === 'day' ? (
              <FormField label="Journée" htmlFor="rp-day" className="w-44">
                <DatePicker id="rp-day" value={period.from} onChange={(v) => setPeriod({ from: v, to: v })} />
              </FormField>
            ) : (
              <>
                <FormField label="Du" htmlFor="rp-from" className="w-44"><DatePicker id="rp-from" value={period.from} max={period.to} onChange={(v) => setPeriod((p) => ({ ...p, from: v }))} /></FormField>
                <FormField label="Au" htmlFor="rp-to" className="w-44"><DatePicker id="rp-to" value={period.to} min={period.from} onChange={(v) => setPeriod((p) => ({ ...p, to: v }))} /></FormField>
              </>
            )}
            <FormField label={def.needsEmployee ? 'Employé *' : 'Employé'} htmlFor="rp-emp" className="w-64">
              <div className="flex gap-1">
                <EmployeePicker id="rp-emp" value={employee} onChange={(ids) => setEmployee(ids)} placeholder={def.needsEmployee ? 'Choisir un employé' : 'Tous les employés'} className="flex-1" />
                {employee.length > 0 && <Button variant="ghost" size="icon" onClick={() => setEmployee([])} aria-label="Retirer le filtre employé">×</Button>}
              </div>
            </FormField>
            {!isManager && <FormField label="Département" htmlFor="rp-dep" className="w-56"><DepartmentSelect id="rp-dep" value={departmentId} onChange={setDepartmentId} /></FormField>}
            {def.statuses && (
              <FormField label="Statut" htmlFor="rp-st" className="w-44">
                <Select id="rp-st" value={status} onValueChange={setStatus} allLabel="Tous" options={def.statuses} />
              </FormField>
            )}
            <Button leftIcon={<Play />} onClick={() => { const p = params(); if (p) setSubmitted(p); }} loading={q.isFetching && !!submitted}>Générer l'aperçu</Button>
          </div>
          {error && <p className="mt-3 text-sm font-medium text-danger" role="alert">{error}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
            <span className="mr-1 text-xs font-medium uppercase tracking-wide text-muted">Exporter</span>
            <Button variant="outline" size="sm" leftIcon={<FileSpreadsheet className="text-green-700" />} loading={exporting === 'xlsx'} disabled={!!exporting} onClick={() => exportAs('xlsx')}>Excel</Button>
            <Button variant="outline" size="sm" leftIcon={<FileText className="text-red-600" />} loading={exporting === 'pdf'} disabled={!!exporting} onClick={() => exportAs('pdf')}>PDF</Button>
            <Button variant="outline" size="sm" leftIcon={<FileType2 className="text-slate-600" />} loading={exporting === 'csv'} disabled={!!exporting} onClick={() => exportAs('csv')}>CSV</Button>
          </div>
        </CardContent>
      </Card>

      {!submitted ? (
        <Card><EmptyState icon={TableProperties} title={def.title} description="Ajustez les filtres puis générez l'aperçu, ou exportez directement le fichier." /></Card>
      ) : q.isPending ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
          <Card><div className="p-4"><TableSkeleton rows={8} cols={6} /></div></Card>
        </div>
      ) : q.isError ? (
        <Card><LoadError error={q.error} onRetry={q.refetch} /></Card>
      ) : data ? (
        <div className={cn('space-y-4 transition-opacity', q.isFetching && 'opacity-60')}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold text-ink">{data.title}</h2>
            <p className="text-xs text-muted">
              Période du {formatDate(data.period?.from)} au {formatDate(data.period?.to)} · généré le {formatDateTime(data.generatedAt)}
            </p>
          </div>
          {data.summary?.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
              {data.summary.map((s, i) => (
                <div key={i} className="rounded-xl border border-slate-200 bg-white p-4 shadow-card">
                  <p className="text-xs font-medium text-muted">{s.label}</p>
                  <p className="mt-1 text-lg font-semibold leading-snug text-ink tabular">{typeof s.value === 'number' ? formatNumber(s.value, 2) : s.value ?? '—'}</p>
                </div>
              ))}
            </div>
          )}
          <TableContainer>
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <p className="flex items-center gap-2 text-sm font-medium text-ink"><Sheet className="h-4 w-4 text-slate-400" />{formatNumber(data.rows.length)} ligne{data.rows.length > 1 ? 's' : ''}</p>
            </div>
            {data.rows.length === 0 ? (
              <EmptyState compact icon={TableProperties} title="Aucune donnée sur cette période" description="Modifiez la période ou les filtres." />
            ) : (
              <div className="max-h-[70vh] overflow-auto scrollbar-thin">
                <Table>
                  <TableHeader className="sticky top-0 z-10">
                    <TableRow>
                      {data.columns.map((c) => <TableHead key={c.key} align={isNumericCol(data.rows, c.key) ? 'right' : 'left'}>{c.label}</TableHead>)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.rows.map((r, i) => (
                      <TableRow key={i} className="even:bg-slate-50/40">
                        {data.columns.map((c) => (
                          <TableCell key={c.key} align={isNumericCol(data.rows, c.key) ? 'right' : 'left'} className="whitespace-nowrap">{renderCell(c.key, r[c.key])}</TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TableContainer>
        </div>
      ) : null}
    </div>
  );
}
