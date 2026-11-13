import * as React from 'react';
import { ListChecks, PencilLine, Plus, ScrollText } from 'lucide-react';
import {
  Avatar, Badge, Button, Card, DateRangePicker, FilterBar, PageHeader, Pagination, Select, StatusBadge, Switch, Table, TableBody,
  TableCell, TableContainer, TableEmptyRow, TableHead, TableHeader, TableRow, TableSkeleton, Tabs, TabsContent, TabsList, TabsTrigger, Label,
} from '@/components/ui';
import { assetUrl } from '@/lib/api';
import { CLOCK_STATE, DAY_STATUS } from '@/lib/labels';
import { addDaysISO, formatDate, formatDayShort, formatDuration, formatTime, todayISO } from '@/lib/format';
import { useAttendanceList, useEvents } from '@/features/attendance/api';
import { AttendanceDetailDialog } from '@/features/attendance/components/AttendanceDetailDialog';
import { ExceptionalDialog } from '@/features/attendance/components/ExceptionalDialog';
import { EventTimeline } from '@/features/attendance/components/EventTimeline';
import { useDepartmentOptions, useEmployeeSelectOptions } from '@/features/org/api';
import { QueryError, useIsHR } from '@/features/org/components/shared';
import { useUrlState } from '@/features/org/useUrlState';

const dayStatusOptions = Object.entries(DAY_STATUS).map(([value, d]) => ({ value, label: d.label }));
const stateOptions = Object.entries(CLOCK_STATE).map(([value, d]) => ({ value, label: d.label }));

function DaysTab() {
  const today = todayISO();
  const defaults = React.useMemo(() => ({
    from: addDaysISO(today, -6), to: today, date: '', departmentId: '', employeeId: '', state: '', dayStatus: '', corrected: '', open: '', correct: '',
  }), [today]);
  const { values: f, set, page, setPage, reset, dirty } = useUrlState(defaults);
  const [pageSize, setPageSize] = React.useState(25);
  const deptOptions = useDepartmentOptions();
  const empOptions = useEmployeeSelectOptions();
  const isHR = useIsHR();
  const [excOpen, setExcOpen] = React.useState(false);

  // `date` (lien depuis le tableau de bord) prime sur la période.
  const from = f.date || f.from;
  const to = f.date || f.to;
  const q = useAttendanceList({
    from, to, departmentId: f.departmentId, employeeId: f.employeeId, state: f.state, dayStatus: f.dayStatus,
    corrected: f.corrected === '1' ? '1' : undefined, page, pageSize,
  });
  const openId = f.open ? Number(f.open) : null;

  return (
    <>
      <Card className="overflow-hidden">
        <FilterBar
          onReset={reset}
          canReset={dirty}
          actions={isHR && <Button size="sm" leftIcon={<Plus />} onClick={() => setExcOpen(true)}>Pointage exceptionnel</Button>}
        >
          <DateRangePicker from={from} to={to} onChange={(r) => set({ from: r.from, to: r.to, date: '' })} />
          <Select className="sm:w-[200px]" value={f.departmentId} onValueChange={(v) => set({ departmentId: v })} options={deptOptions} allLabel="Tous les départements" aria-label="Département" />
          <Select className="sm:w-[200px]" value={f.employeeId} onValueChange={(v) => set({ employeeId: v })} options={empOptions} allLabel="Tous les employés" aria-label="Employé" />
          <Select className="sm:w-[200px]" value={f.state} onValueChange={(v) => set({ state: v })} options={stateOptions} allLabel="Tous les états" aria-label="État" />
          <Select className="sm:w-[200px]" value={f.dayStatus} onValueChange={(v) => set({ dayStatus: v })} options={dayStatusOptions} allLabel="Toutes les qualifications" aria-label="Qualification" />
          <div className="flex h-10 items-center gap-2 !min-w-0">
            <Switch id="att-corrected" checked={f.corrected === '1'} onCheckedChange={(c) => set({ corrected: c ? '1' : '' })} />
            <Label htmlFor="att-corrected" className="whitespace-nowrap">Corrigées</Label>
          </div>
        </FilterBar>
        <TableContainer className="rounded-none border-0 shadow-none">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employé</TableHead>
                <TableHead>Journée</TableHead>
                <TableHead>Qualification</TableHead>
                <TableHead align="right">Arrivée</TableHead>
                <TableHead align="right">Départ</TableHead>
                <TableHead align="right">Retard</TableHead>
                <TableHead align="right" className="hidden xl:table-cell">Présence</TableHead>
                <TableHead align="right">Effectif</TableHead>
                <TableHead align="right" className="hidden md:table-cell">HS pot.</TableHead>
                {isHR && <TableHead align="right"><span className="sr-only">Actions</span></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.isLoading ? (
                <tr><td colSpan={10}><TableSkeleton rows={8} cols={7} /></td></tr>
              ) : q.error ? (
                <tr><td colSpan={10}><QueryError error={q.error} onRetry={q.refetch} compact /></td></tr>
              ) : !q.data?.items.length ? (
                <TableEmptyRow colSpan={10}>Aucune journée ne correspond à ces filtres.</TableEmptyRow>
              ) : q.data.items.map((a) => (
                <TableRow key={a.id} clickable onClick={() => set({ open: String(a.id), correct: '' }, true)}>
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
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusBadge kind="day" value={a.dayStatus} />
                      {a.corrected && <Badge variant="brand" title="Journée corrigée"><PencilLine className="h-3 w-3" /></Badge>}
                    </div>
                  </TableCell>
                  <TableCell align="right" className="tabular">{formatTime(a.arrivalAt)}</TableCell>
                  <TableCell align="right" className="tabular">{formatTime(a.departureAt)}</TableCell>
                  <TableCell align="right" className={`tabular ${a.lateMinutes ? 'font-medium text-warning-strong' : 'text-muted'}`}>{a.lateMinutes ? formatDuration(a.lateMinutes) : '—'}</TableCell>
                  <TableCell align="right" className="hidden tabular xl:table-cell">{a.presenceMinutes ? formatDuration(a.presenceMinutes) : '—'}</TableCell>
                  <TableCell align="right" className="tabular">{a.workedMinutes ? formatDuration(a.workedMinutes) : '—'}</TableCell>
                  <TableCell align="right" className="hidden tabular md:table-cell">{a.overtimePotentialMinutes ? formatDuration(a.overtimePotentialMinutes) : '—'}</TableCell>
                  {isHR && (
                    <TableCell align="right">
                      <Button
                        variant="ghost" size="icon-sm" aria-label={`Corriger la journée de ${a.employee.fullName}`} title="Corriger"
                        onClick={(e) => { e.stopPropagation(); set({ open: String(a.id), correct: '1' }, true); }}
                      >
                        <PencilLine />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {q.data && q.data.total > 0 && (
            <Pagination page={page} pageSize={pageSize} total={q.data.total} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />
          )}
        </TableContainer>
      </Card>
      <AttendanceDetailDialog
        id={openId}
        open={!!openId}
        startInCorrect={f.correct === '1'}
        onOpenChange={(o) => !o && set({ open: '', correct: '' }, true)}
      />
      {isHR && <ExceptionalDialog open={excOpen} onOpenChange={setExcOpen} defaultEmployeeId={f.employeeId ? Number(f.employeeId) : undefined} />}
    </>
  );
}

function RawLogTab() {
  const today = todayISO();
  const [from, setFrom] = React.useState(addDaysISO(today, -1));
  const [to, setTo] = React.useState(today);
  const [employeeId, setEmployeeId] = React.useState('');
  const [result, setResult] = React.useState('');
  const [page, setPage] = React.useState(1);
  const empOptions = useEmployeeSelectOptions();
  const q = useEvents({ from, to, employeeId, result, page, pageSize: 50 });
  const dirty = !!employeeId || !!result || from !== addDaysISO(today, -1) || to !== today;

  return (
    <Card className="overflow-hidden">
      <FilterBar
        canReset={dirty}
        onReset={() => { setFrom(addDaysISO(today, -1)); setTo(today); setEmployeeId(''); setResult(''); setPage(1); }}
      >
        <DateRangePicker from={from} to={to} onChange={(r) => { setFrom(r.from); setTo(r.to); setPage(1); }} />
        <Select className="sm:w-[200px]" value={employeeId} onValueChange={(v) => { setEmployeeId(v); setPage(1); }} options={empOptions} allLabel="Tous les employés" aria-label="Employé" />
        <Select
          className="sm:w-[200px]"
          value={result}
          onValueChange={(v) => { setResult(v); setPage(1); }}
          options={[{ value: 'ACCEPTE', label: 'Acceptés' }, { value: 'REFUSE', label: 'Refusés' }]}
          allLabel="Acceptés et refusés"
          aria-label="Résultat"
        />
      </FilterBar>
      <div className="p-4 sm:p-6">
        {q.isLoading ? <TableSkeleton rows={6} cols={3} />
          : q.error ? <QueryError error={q.error} onRetry={q.refetch} compact />
          : <EventTimeline events={q.data?.items ?? []} showDate />}
      </div>
      {q.data && q.data.total > 50 && (
        <div className="border-t border-slate-100"><Pagination page={page} pageSize={50} total={q.data.total} onPageChange={setPage} /></div>
      )}
      {q.data && <p className="border-t border-slate-100 px-6 py-3 text-xs text-muted">{q.data.total} événement(s) du {formatDate(from)} au {formatDate(to)}.</p>}
    </Card>
  );
}

export default function AdminAttendancePage() {
  const [tab, setTab] = React.useState('days');
  return (
    <div>
      <PageHeader
        title="Pointages"
        description="Journées de travail, détail des événements, corrections tracées et journal brut des scans."
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="days"><ListChecks />Journées</TabsTrigger>
          <TabsTrigger value="raw"><ScrollText />Journal brut</TabsTrigger>
        </TabsList>
        <TabsContent value="days"><DaysTab /></TabsContent>
        <TabsContent value="raw"><RawLogTab /></TabsContent>
      </Tabs>
    </div>
  );
}

