import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Download, Eye, FileUp, KeyRound, MoreHorizontal, Pencil, Plus, Power, PowerOff, QrCode, Users, X,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Avatar, Badge, Button, Card, Checkbox, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
  EmptyState, FilterBar, PageHeader, Pagination, SearchInput, Select, StatusBadge, Table, TableBody, TableCell, TableContainer, TableHead,
  TableHeader, TableRow, TableSkeleton,
} from '@/components/ui';
import { assetUrl, downloadFile, errorMessage } from '@/lib/api';
import { ROLE_LABELS } from '@/lib/labels';
import type { Employee } from '@/lib/types';
import { badgesUrl, useEmployees } from '@/features/employees/api';
import { ImportDialog } from '@/features/employees/components/ImportDialog';
import { isEmployeeActive, useEmployeeActions } from '@/features/employees/components/useEmployeeActions';
import { useDepartmentOptions } from '@/features/org/api';
import { QueryError, useIsHR } from '@/features/org/components/shared';
import { useUrlState } from '@/features/org/useUrlState';
import { useAuth } from '@/features/auth/AuthProvider';

export default function AdminEmployeesPage() {
  const navigate = useNavigate();
  const isHR = useIsHR();
  const { user } = useAuth();
  const defaults = React.useMemo(() => ({ q: '', departmentId: '', status: 'ACTIVE' }), []);
  const { values: f, set, page, setPage, reset, dirty } = useUrlState(defaults);
  const [pageSize, setPageSize] = React.useState(25);
  const q = useEmployees({ q: f.q, departmentId: f.departmentId, status: f.status, page, pageSize });
  const deptOptions = useDepartmentOptions();
  const actions = useEmployeeActions();
  const [selected, setSelected] = React.useState<Set<number>>(new Set());
  const [importOpen, setImportOpen] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);

  const items = q.data?.items ?? [];
  const allChecked = items.length > 0 && items.every((e) => selected.has(e.id));
  const someChecked = items.some((e) => selected.has(e.id));
  const toggleAll = () => setSelected((s) => {
    const n = new Set(s);
    if (allChecked) items.forEach((e) => n.delete(e.id)); else items.forEach((e) => n.add(e.id));
    return n;
  });
  const toggleOne = (id: number) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function exportXlsx() {
    setExporting(true);
    try { await downloadFile('/employees/export.xlsx', { q: f.q, departmentId: f.departmentId, status: f.status }, 'employes.xlsx'); }
    catch (e) { toast.error(errorMessage(e)); }
    finally { setExporting(false); }
  }
  function printBadges(ids: number[]) {
    if (!ids.length) return;
    window.open(badgesUrl(ids), '_blank', 'noopener');
  }

  const managerScope = !isHR && user?.employee?.departmentName;
  const cols = isHR ? 8 : 6;

  return (
    <div>
      <PageHeader
        title="Employés"
        description={managerScope ? `Effectif du département ${managerScope} (lecture seule).` : 'Gestion du personnel, des comptes de connexion et des badges QR.'}
        actions={isHR && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" leftIcon={<FileUp />} onClick={() => setImportOpen(true)}>Importer</Button>
            <Button variant="outline" leftIcon={<Download />} onClick={exportXlsx} loading={exporting}>Exporter</Button>
            <Button leftIcon={<Plus />} onClick={actions.create}>Nouvel employé</Button>
          </div>
        )}
      />

      <Card className="overflow-hidden">
        <FilterBar
          search={<SearchInput value={f.q} onChange={(v) => set({ q: v })} placeholder="Nom, matricule, e-mail…" />}
          onReset={reset}
          canReset={dirty}
        >
          {isHR && <Select className="sm:w-[200px]" value={f.departmentId} onValueChange={(v) => set({ departmentId: v })} options={deptOptions} allLabel="Tous les départements" aria-label="Département" />}
          <Select
            className="sm:w-[160px]"
            value={f.status}
            onValueChange={(v) => set({ status: v })}
            options={[{ value: 'ACTIVE', label: 'Actifs' }, { value: 'INACTIVE', label: 'Inactifs' }]}
            allLabel="Tous les statuts"
            aria-label="Statut"
          />
        </FilterBar>

        {isHR && selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-3 border-b border-brand-100 bg-brand-50/60 px-4 py-2.5 text-sm">
            <span className="font-medium text-brand-700">{selected.size} employé(s) sélectionné(s)</span>
            <Button size="sm" leftIcon={<QrCode />} onClick={() => printBadges([...selected])}>Imprimer les badges QR</Button>
            <Button size="sm" variant="ghost" leftIcon={<X />} onClick={() => setSelected(new Set())}>Effacer la sélection</Button>
          </div>
        )}

        <TableContainer className="rounded-none border-0 shadow-none">
          <Table>
            <TableHeader>
              <TableRow>
                {isHR && (
                  <TableHead className="w-10">
                    <Checkbox checked={allChecked ? true : someChecked ? 'indeterminate' : false} onCheckedChange={toggleAll} aria-label="Tout sélectionner" />
                  </TableHead>
                )}
                <TableHead>Employé</TableHead>
                <TableHead className="hidden sm:table-cell">Matricule</TableHead>
                <TableHead>Département</TableHead>
                <TableHead className="hidden lg:table-cell">Poste</TableHead>
                <TableHead>Statut</TableHead>
                {isHR && <TableHead className="hidden md:table-cell">Rôle</TableHead>}
                <TableHead align="right"><span className="sr-only">Actions</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.isLoading ? (
                <tr><td colSpan={cols}><TableSkeleton rows={8} cols={5} /></td></tr>
              ) : q.error ? (
                <tr><td colSpan={cols}><QueryError error={q.error} onRetry={q.refetch} compact /></td></tr>
              ) : !items.length ? (
                <tr><td colSpan={cols}>
                  <EmptyState compact icon={Users} title="Aucun employé" description={dirty ? 'Aucun employé ne correspond à ces critères.' : 'Ajoutez votre premier employé ou importez un fichier Excel.'}
                    action={isHR && !dirty && <Button size="sm" leftIcon={<Plus />} onClick={actions.create}>Nouvel employé</Button>} />
                </td></tr>
              ) : items.map((e: Employee) => (
                <TableRow key={e.id} clickable selected={selected.has(e.id)} onClick={() => navigate(`/admin/employees/${e.id}`)}>
                  {isHR && (
                    <TableCell onClick={(ev) => ev.stopPropagation()}>
                      <Checkbox checked={selected.has(e.id)} onCheckedChange={() => toggleOne(e.id)} aria-label={`Sélectionner ${e.fullName}`} />
                    </TableCell>
                  )}
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar name={e.fullName} src={assetUrl(e.photoUrl)} size="md" />
                      <div className="min-w-0">
                        <div className="truncate font-medium text-ink">{e.lastName.toUpperCase()} {e.firstNames}</div>
                        <div className="truncate text-xs text-muted">{e.email ?? e.phone ?? <span className="sm:hidden">{e.matricule}</span>}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden whitespace-nowrap font-medium tabular text-slate-700 sm:table-cell">{e.matricule}</TableCell>
                  <TableCell>{e.departmentName ?? <span className="text-muted">—</span>}</TableCell>
                  <TableCell className="hidden lg:table-cell">{e.positionTitle ?? <span className="text-muted">—</span>}</TableCell>
                  <TableCell><StatusBadge kind="employee" value={e.status} /></TableCell>
                  {isHR && (
                    <TableCell className="hidden md:table-cell">
                      <Badge variant={e.role === 'EMPLOYEE' ? 'muted' : e.role === 'MANAGER' ? 'info' : 'brand'}>{ROLE_LABELS[e.role] ?? e.role}</Badge>
                    </TableCell>
                  )}
                  <TableCell align="right" onClick={(ev) => ev.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`Actions pour ${e.fullName}`}><MoreHorizontal /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem icon={<Eye />} onSelect={() => navigate(`/admin/employees/${e.id}`)}>Voir la fiche</DropdownMenuItem>
                        {isHR && (
                          <>
                            <DropdownMenuItem icon={<Pencil />} onSelect={() => actions.edit(e)}>Modifier</DropdownMenuItem>
                            <DropdownMenuItem icon={<KeyRound />} onSelect={() => actions.resetPassword(e)}>Réinitialiser le mot de passe</DropdownMenuItem>
                            <DropdownMenuItem icon={<QrCode />} onSelect={() => printBadges([e.id])}>Imprimer le badge QR</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            {isEmployeeActive(e)
                              ? <DropdownMenuItem destructive icon={<PowerOff />} onSelect={() => actions.toggle(e)}>Désactiver</DropdownMenuItem>
                              : <DropdownMenuItem icon={<Power />} onSelect={() => actions.toggle(e)}>Réactiver</DropdownMenuItem>}
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {q.data && q.data.total > 0 && (
            <Pagination page={page} pageSize={pageSize} total={q.data.total} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />
          )}
        </TableContainer>
      </Card>
      {actions.dialogs}
      {isHR && <ImportDialog open={importOpen} onOpenChange={setImportOpen} />}
    </div>
  );
}
