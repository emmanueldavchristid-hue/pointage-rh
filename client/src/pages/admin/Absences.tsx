import * as React from 'react';
import { CalendarOff, Check, FileText, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  Avatar, Button, Card, ConfirmDialog, DateRangePicker, EmptyState, FilterBar, PageHeader, Pagination, Select, StatusBadge, Table, TableBody,
  TableCell, TableContainer, TableHead, TableHeader, TableRow, TableSkeleton,
} from '@/components/ui';
import { assetUrl, errorMessage } from '@/lib/api';
import { DAY_STATUS } from '@/lib/labels';
import { formatDate, formatDayShort, monthRange, currentMonthISO } from '@/lib/format';
import { useAbsences, useReviewJustification, type Absence } from '@/features/absences/api';
import { AttendanceDetailDialog } from '@/features/attendance/components/AttendanceDetailDialog';
import { useDepartmentOptions, useEmployeeSelectOptions } from '@/features/org/api';
import { QueryError, useIsHR } from '@/features/org/components/shared';
import { useUrlState } from '@/features/org/useUrlState';

const TYPES = ['ABSENCE_NON_JUSTIFIEE', 'ABSENCE_JUSTIFIEE', 'CONGE', 'PERMISSION', 'MISSION'] as const;

export default function AdminAbsencesPage() {
  const m = monthRange(currentMonthISO());
  const defaults = React.useMemo(() => ({ from: m.from, to: m.to, departmentId: '', employeeId: '', dayStatus: '' }), [m.from, m.to]);
  const { values: f, set, page, setPage, reset, dirty } = useUrlState(defaults);
  const [pageSize, setPageSize] = React.useState(25);
  const q = useAbsences({ ...f, page, pageSize });
  const deptOptions = useDepartmentOptions();
  const empOptions = useEmployeeSelectOptions();
  const isHR = useIsHR();
  const review = useReviewJustification();
  const [reviewing, setReviewing] = React.useState<{ abs: Absence; status: 'VALIDE' | 'REJETE' } | null>(null);
  const [openId, setOpenId] = React.useState<number | null>(null);

  const items = q.data?.items ?? [];
  const counts = TYPES.map((t) => ({ t, n: items.filter((a) => a.dayStatus === t).length }));

  return (
    <div>
      <PageHeader title="Absences" description="Suivi des journées non travaillées : absences, congés, permissions et missions, avec leurs justificatifs." />

      {q.data && q.data.total <= items.length && items.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {counts.filter((c) => c.n > 0).map((c) => (
            <button key={c.t} type="button" onClick={() => set({ dayStatus: f.dayStatus === c.t ? '' : c.t })}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${f.dayStatus === c.t ? 'border-brand bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'}`}>
              {DAY_STATUS[c.t].label}<span className="font-semibold tabular">{c.n}</span>
            </button>
          ))}
        </div>
      )}

      <Card className="overflow-hidden">
        <FilterBar onReset={reset} canReset={dirty}>
          <DateRangePicker from={f.from} to={f.to} onChange={(r) => set({ from: r.from, to: r.to })} />
          <Select value={f.departmentId} onValueChange={(v) => set({ departmentId: v })} options={deptOptions} allLabel="Tous les départements" aria-label="Département" />
          <Select value={f.employeeId} onValueChange={(v) => set({ employeeId: v })} options={empOptions} allLabel="Tous les employés" aria-label="Employé" />
          <Select value={f.dayStatus} onValueChange={(v) => set({ dayStatus: v })} options={TYPES.map((t) => ({ value: t, label: DAY_STATUS[t].label }))} allLabel="Tous les types" aria-label="Type" />
        </FilterBar>
        <TableContainer className="rounded-none border-0 shadow-none">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employé</TableHead>
                <TableHead>Journée</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Justificatif</TableHead>
                <TableHead align="right"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.isLoading ? <tr><td colSpan={5}><TableSkeleton rows={6} cols={4} /></td></tr>
                : q.error ? <tr><td colSpan={5}><QueryError error={q.error} onRetry={q.refetch} compact label="Absences" /></td></tr>
                : !items.length ? <tr><td colSpan={5}><EmptyState compact icon={CalendarOff} title="Aucune absence" description="Aucune absence sur la période et les filtres choisis." /></td></tr>
                : items.map((a) => {
                  const j = a.justification;
                  return (
                    <TableRow key={a.id} clickable onClick={() => setOpenId(a.id)}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar name={a.employee.fullName} src={assetUrl(a.employee.photoUrl)} size="sm" />
                          <div className="min-w-0">
                            <div className="truncate font-medium text-ink">{a.employee.fullName}</div>
                            <div className="truncate text-xs text-muted">{a.employee.matricule}{a.employee.departmentName ? ` · ${a.employee.departmentName}` : ''}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{formatDayShort(a.workDate)}</TableCell>
                      <TableCell><StatusBadge kind="day" value={a.dayStatus} /></TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        {j ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusBadge kind="review" value={j.status} />
                            {(j.hasFile ?? !!j.fileName) && (
                              <a href={`/api/justifications/${j.id}/file`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline">
                                <FileText className="h-3.5 w-3.5" />{j.fileName ?? 'Fichier'}
                              </a>
                            )}
                          </div>
                        ) : <span className="text-sm text-muted">Aucun</span>}
                      </TableCell>
                      <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                        {isHR && j && j.status === 'EN_ATTENTE' && (
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="success" leftIcon={<Check />} onClick={() => setReviewing({ abs: a, status: 'VALIDE' })}>Valider</Button>
                            <Button size="sm" variant="ghost" leftIcon={<X />} onClick={() => setReviewing({ abs: a, status: 'REJETE' })}>Rejeter</Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
          {q.data && q.data.total > 0 && (
            <Pagination page={page} pageSize={pageSize} total={q.data.total} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />
          )}
        </TableContainer>
      </Card>

      <ConfirmDialog
        open={!!reviewing}
        onOpenChange={(o) => !o && setReviewing(null)}
        title={reviewing?.status === 'VALIDE' ? 'Valider le justificatif ?' : 'Rejeter le justificatif ?'}
        description={reviewing ? `${reviewing.abs.employee.fullName} · ${formatDate(reviewing.abs.workDate)}. ${reviewing.status === 'VALIDE' ? 'La journée sera requalifiée en absence justifiée.' : 'La journée restera une absence non justifiée.'}` : undefined}
        confirmLabel={reviewing?.status === 'VALIDE' ? 'Valider' : 'Rejeter'}
        tone={reviewing?.status === 'VALIDE' ? 'default' : 'danger'}
        withReason
        reasonRequired={reviewing?.status === 'REJETE'}
        reasonLabel="Commentaire"
        reasonPlaceholder="Commentaire transmis à l'employé (facultatif pour une validation)."
        onConfirm={async (comment) => {
          if (!reviewing?.abs.justification) return;
          try {
            await review.mutateAsync({ id: reviewing.abs.justification.id, status: reviewing.status, comment });
            toast.success(reviewing.status === 'VALIDE' ? 'Justificatif validé.' : 'Justificatif rejeté.');
          } catch (e) { toast.error(errorMessage(e)); throw e; }
        }}
      />
      <AttendanceDetailDialog id={openId} open={!!openId} onOpenChange={(o) => !o && setOpenId(null)} />
    </div>
  );
}
