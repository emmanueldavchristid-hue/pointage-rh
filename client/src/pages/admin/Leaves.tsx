import * as React from 'react';
import { CalendarCheck, CalendarRange, Inbox, List, Paperclip, Tags } from 'lucide-react';
import {
  Avatar, Badge, Button, DateRangePicker, FilterBar, PageHeader, Pagination, Select, StatusBadge, Table, TableBody, TableCell,
  TableContainer, TableEmptyRow, TableHead, TableHeader, TableRow, TableSkeleton, Tabs, TabsContent, TabsList, TabsTrigger, EmptyState,
} from '@/components/ui';
import { LoadError } from '@/features/admin/shared';
import { useLeaves, type LeaveRequest } from '@/features/leaves/api';
import { LeaveDetailDialog, TypeDot } from '@/features/leaves/components/LeaveDetailDialog';
import { LeaveCalendar } from '@/features/leaves/components/LeaveCalendar';
import { LeaveTypesPanel } from '@/features/leaves/components/LeaveTypesPanel';
import { useAuth } from '@/features/auth/AuthProvider';
import { LEAVE_STATUS } from '@/lib/labels';
import { formatDateShort, formatNumber, formatRelative } from '@/lib/format';

export default function AdminLeavesPage() {
  const { hasRole } = useAuth();
  const isHR = hasRole('SUPER_ADMIN', 'HR_ADMIN');
  const scope = isHR ? 'all' : 'team';
  const [tab, setTab] = React.useState('todo');
  const [selected, setSelected] = React.useState<LeaveRequest | null>(null);

  const todo = useLeaves({ scope, status: 'EN_ATTENTE', page: 1, pageSize: 100 });
  const actionable = (todo.data?.items ?? []).filter((l) => l.canManagerReview || l.canDecide);

  return (
    <div>
      <PageHeader
        title="Congés et permissions"
        description={isHR ? 'Avis des responsables et décision finale de la RH.' : 'Donnez votre avis sur les demandes de votre équipe ; la RH prend la décision finale.'}
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList variant="underline" className="overflow-y-hidden">
          <TabsTrigger value="todo"><Inbox />À traiter{actionable.length > 0 && <Badge variant="warning" className="ml-0.5 px-1.5 py-0 tabular">{actionable.length}</Badge>}</TabsTrigger>
          <TabsTrigger value="all"><List />Toutes les demandes</TabsTrigger>
          <TabsTrigger value="calendar"><CalendarRange />Calendrier</TabsTrigger>
          {isHR && <TabsTrigger value="types"><Tags />Types de congés</TabsTrigger>}
        </TabsList>

        <TabsContent value="todo" className="mt-6">
          <TableContainer>
            <LeavesTable
              rows={actionable}
              loading={todo.isPending}
              error={todo.isError ? todo.error : null}
              onRetry={todo.refetch}
              onOpen={setSelected}
              withAction
              empty={<EmptyState compact icon={CalendarCheck} title="Rien à traiter" description="Toutes les demandes en attente ont reçu votre avis ou votre décision." />}
            />
          </TableContainer>
        </TabsContent>

        <TabsContent value="all" className="mt-6"><AllLeaves scope={scope} onOpen={setSelected} /></TabsContent>
        <TabsContent value="calendar" className="mt-6"><LeaveCalendar /></TabsContent>
        {isHR && <TabsContent value="types" className="mt-6"><LeaveTypesPanel canEdit={isHR} /></TabsContent>}
      </Tabs>

      <LeaveDetailDialog leave={selected} onOpenChange={(o) => !o && setSelected(null)} />
    </div>
  );
}

function AllLeaves({ scope, onOpen }: { scope: 'team' | 'all'; onOpen: (l: LeaveRequest) => void }) {
  const [status, setStatus] = React.useState('');
  const [range, setRange] = React.useState({ from: '', to: '' });
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);
  React.useEffect(() => setPage(1), [status, range.from, range.to, pageSize]);
  const q = useLeaves({ scope, status: status || undefined, from: range.from || undefined, to: range.to || undefined, page, pageSize });
  const canReset = !!(status || range.from || range.to);
  return (
    <TableContainer>
      <FilterBar onReset={() => { setStatus(''); setRange({ from: '', to: '' }); }} canReset={canReset}>
        <Select className="sm:w-56" aria-label="Statut" value={status} onValueChange={setStatus} allLabel="Tous les statuts"
          options={Object.entries(LEAVE_STATUS).filter(([k]) => k !== 'BROUILLON').map(([value, d]) => ({ value, label: d.label }))} />
        <DateRangePicker from={range.from} to={range.to} onChange={setRange} />
      </FilterBar>
      <LeavesTable
        rows={q.data?.items ?? []}
        loading={q.isPending}
        error={q.isError ? q.error : null}
        onRetry={q.refetch}
        onOpen={onOpen}
        empty={<EmptyState compact icon={CalendarCheck} title="Aucune demande" description={canReset ? 'Aucune demande ne correspond à ces filtres.' : 'Aucune demande de congé pour le moment.'} />}
      />
      {q.data && q.data.total > 0 && (
        <Pagination page={page} pageSize={pageSize} total={q.data.total} onPageChange={setPage} onPageSizeChange={setPageSize} />
      )}
    </TableContainer>
  );
}

function LeavesTable({
  rows, loading, error, onRetry, onOpen, empty, withAction,
}: { rows: LeaveRequest[]; loading: boolean; error: unknown; onRetry: () => void; onOpen: (l: LeaveRequest) => void; empty: React.ReactNode; withAction?: boolean }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Employé</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Période</TableHead>
          <TableHead align="right">Jours</TableHead>
          <TableHead>Avis responsable</TableHead>
          <TableHead>Statut</TableHead>
          <TableHead align="right"><span className="sr-only">Action</span></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading ? (
          <TableEmptyRow colSpan={7}><div className="p-4"><TableSkeleton rows={5} cols={6} /></div></TableEmptyRow>
        ) : error ? (
          <TableEmptyRow colSpan={7}><LoadError error={error} onRetry={onRetry} compact /></TableEmptyRow>
        ) : rows.length === 0 ? (
          <TableEmptyRow colSpan={7}>{empty}</TableEmptyRow>
        ) : rows.map((l) => (
          <TableRow key={l.id} clickable onClick={() => onOpen(l)}>
            <TableCell>
              <div className="flex items-center gap-3">
                <Avatar name={l.employee.fullName} src={l.employee.photoUrl ?? undefined} size="sm" />
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">{l.employee.fullName}</p>
                  <p className="truncate text-xs text-muted">{l.employee.departmentName ?? l.employee.matricule} · {formatRelative(l.createdAt)}</p>
                </div>
              </div>
            </TableCell>
            <TableCell>
              <span className="flex items-center gap-2"><TypeDot color={l.leaveType.color} />{l.leaveType.label}{l.justification && <Paperclip className="h-3.5 w-3.5 text-slate-400" aria-label="Justificatif joint" />}</span>
            </TableCell>
            <TableCell className="whitespace-nowrap tabular">{formatDateShort(l.startDate)} → {formatDateShort(l.endDate)}</TableCell>
            <TableCell align="right">{formatNumber(l.workingDays, 1)}</TableCell>
            <TableCell>
              {l.managerDecision === 'FAVORABLE' ? <Badge variant="success">Favorable</Badge>
                : l.managerDecision === 'DEFAVORABLE' ? <Badge variant="danger">Défavorable</Badge>
                  : <span className="text-xs text-muted">—</span>}
            </TableCell>
            <TableCell><StatusBadge kind="leave" value={l.status} /></TableCell>
            <TableCell align="right">
              {withAction || l.canManagerReview || l.canDecide ? (
                <Button size="sm" variant={l.canDecide || l.canManagerReview ? 'secondary' : 'ghost'} onClick={(e) => { e.stopPropagation(); onOpen(l); }}>
                  {l.canDecide ? 'Décider' : l.canManagerReview ? 'Donner un avis' : l.awaitingManager ? 'Avis du responsable attendu' : 'Voir'}
                </Button>
              ) : <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); onOpen(l); }}>Voir</Button>}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
