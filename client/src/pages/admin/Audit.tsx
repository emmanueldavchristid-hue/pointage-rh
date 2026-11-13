import * as React from 'react';
import { ArrowRight, FileClock, Globe, Info, MessageSquare } from 'lucide-react';
import {
  Badge, Button, DateRangePicker, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  EmptyState, FilterBar, PageHeader, Pagination, Select, Table, TableBody, TableCell, TableContainer, TableEmptyRow, TableHead,
  TableHeader, TableRow, TableSkeleton, Tabs, TabsContent, TabsList, TabsTrigger,
} from '@/components/ui';
import { LoadError } from '@/features/admin/shared';
import { useAdminUsers, useAuditLogs, type AuditLog } from '@/features/admin/api';
import { AUDIT_ACTIONS, auditEntity, auditLabel, auditTone, diff } from '@/features/admin/audit';
import { formatDateTime, formatRelative } from '@/lib/format';
import { cn } from '@/lib/utils';

export default function AdminAuditPage() {
  const [action, setAction] = React.useState('');
  const [userId, setUserId] = React.useState('');
  const [range, setRange] = React.useState({ from: '', to: '' });
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);
  const [selected, setSelected] = React.useState<AuditLog | null>(null);
  React.useEffect(() => setPage(1), [action, userId, range.from, range.to, pageSize]);
  const q = useAuditLogs({ action: action || undefined, userId: userId || undefined, from: range.from || undefined, to: range.to || undefined, page, pageSize });
  const users = useAdminUsers();
  const actionOptions = React.useMemo(() => {
    const codes = new Set(Object.keys(AUDIT_ACTIONS));
    (q.data?.items ?? []).forEach((l) => codes.add(l.action));
    ['EXPORT_REPORT', 'EXPORT_EMPLOYEES'].forEach((c) => codes.add(c));
    return [...codes].map((c) => ({ value: c, label: auditLabel(c) })).sort((a, b) => a.label.localeCompare(b.label, 'fr'));
  }, [q.data]);
  const canReset = !!(action || userId || range.from || range.to);

  return (
    <div>
      <PageHeader title="Journal d'audit" description="Traçabilité des actions sensibles : connexions, corrections, décisions, paramètres, exports." />
      <TableContainer>
        <FilterBar onReset={() => { setAction(''); setUserId(''); setRange({ from: '', to: '' }); }} canReset={canReset}>
          <Select className="sm:w-56" aria-label="Action" value={action} onValueChange={setAction} allLabel="Toutes les actions" options={actionOptions} />
          <Select className="sm:w-56" aria-label="Utilisateur" value={userId} onValueChange={setUserId} allLabel="Tous les utilisateurs"
            options={(users.data ?? []).map((u) => ({ value: String(u.id), label: u.employeeName ? `${u.login} (${u.employeeName})` : u.login }))} />
          <DateRangePicker from={range.from} to={range.to} onChange={setRange} />
        </FilterBar>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Utilisateur</TableHead>
              <TableHead>Objet</TableHead>
              <TableHead>Motif</TableHead>
              <TableHead>Adresse IP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.isPending ? (
              <TableEmptyRow colSpan={6}><div className="p-4"><TableSkeleton rows={8} cols={6} /></div></TableEmptyRow>
            ) : q.isError ? (
              <TableEmptyRow colSpan={6}><LoadError error={q.error} onRetry={q.refetch} compact /></TableEmptyRow>
            ) : q.data.items.length === 0 ? (
              <TableEmptyRow colSpan={6}><EmptyState compact icon={FileClock} title="Aucune entrée" description={canReset ? 'Aucune action ne correspond à ces filtres.' : 'Le journal est vide.'} /></TableEmptyRow>
            ) : q.data.items.map((l) => (
              <TableRow key={l.id} clickable onClick={() => setSelected(l)}>
                <TableCell className="whitespace-nowrap">
                  <p className="tabular text-ink">{formatDateTime(l.at)}</p>
                  <p className="text-xs text-muted">{formatRelative(l.at)}</p>
                </TableCell>
                <TableCell><Badge variant={auditTone(l.action)}>{auditLabel(l.action)}</Badge></TableCell>
                <TableCell>{l.userLogin ?? <span className="text-muted">Système</span>}</TableCell>
                <TableCell className="text-sm">{auditEntity(l.entity, l.entityId) ?? <span className="text-muted">—</span>}</TableCell>
                <TableCell className="max-w-[260px] truncate text-sm" title={l.reason ?? undefined}>{l.reason ?? <span className="text-muted">—</span>}</TableCell>
                <TableCell className="font-mono text-xs text-muted">{l.ip ?? '—'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {q.data && q.data.total > 0 && <Pagination page={page} pageSize={pageSize} total={q.data.total} onPageChange={setPage} onPageSizeChange={setPageSize} />}
      </TableContainer>
      <AuditDetail log={selected} onOpenChange={(o) => !o && setSelected(null)} />
    </div>
  );
}

function show(v: unknown): string {
  if (v === undefined) return '';
  if (v === null) return 'vide';
  if (typeof v === 'boolean') return v ? 'oui' : 'non';
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

function AuditDetail({ log: l, onOpenChange }: { log: AuditLog | null; onOpenChange: (o: boolean) => void }) {
  const rows = l ? diff(l.before, l.after) : [];
  const changed = rows.filter((r) => r.kind !== 'same');
  const hasData = l && (l.before != null || l.after != null);
  return (
    <Dialog open={!!l} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        {l && (
          <>
            <DialogHeader>
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle>{auditLabel(l.action)}</DialogTitle>
                <Badge variant="outline" className="font-mono">{l.action}</Badge>
              </div>
              <DialogDescription>{formatDateTime(l.at)} · {l.userLogin ?? 'Système'}</DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-4">
              <div className="grid gap-3 text-sm sm:grid-cols-3">
                <div className="rounded-lg border border-slate-200 p-3"><p className="flex items-center gap-1.5 text-xs text-muted"><Info className="h-3.5 w-3.5" />Objet</p><p className="mt-0.5 font-medium text-ink">{auditEntity(l.entity, l.entityId) ?? '—'}</p></div>
                <div className="rounded-lg border border-slate-200 p-3"><p className="flex items-center gap-1.5 text-xs text-muted"><Globe className="h-3.5 w-3.5" />Adresse IP</p><p className="mt-0.5 font-mono text-ink">{l.ip ?? '—'}</p></div>
                <div className="rounded-lg border border-slate-200 p-3"><p className="flex items-center gap-1.5 text-xs text-muted"><MessageSquare className="h-3.5 w-3.5" />Motif</p><p className="mt-0.5 text-ink">{l.reason ?? '—'}</p></div>
              </div>
              {!hasData ? (
                <p className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-sm text-muted">Aucune donnée avant/après enregistrée pour cette action.</p>
              ) : (
                <Tabs defaultValue="diff">
                  <TabsList>
                    <TabsTrigger value="diff">Modifications ({changed.length})</TabsTrigger>
                    <TabsTrigger value="raw">JSON complet</TabsTrigger>
                  </TabsList>
                  <TabsContent value="diff">
                    {changed.length === 0 ? (
                      <p className="p-4 text-center text-sm text-muted">Aucune différence entre avant et après.</p>
                    ) : (
                      <div className="overflow-hidden rounded-lg border border-slate-200">
                        <table className="w-full text-sm">
                          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-muted">
                            <tr><th className="px-3 py-2 text-left font-medium">Champ</th><th className="px-3 py-2 text-left font-medium">Avant</th><th className="w-6" /><th className="px-3 py-2 text-left font-medium">Après</th></tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {changed.map((r) => (
                              <tr key={r.path} className="align-top">
                                <td className="px-3 py-2 font-mono text-xs text-slate-600">{r.path}</td>
                                <td className="px-3 py-2">{r.kind !== 'added' && <span className="break-all rounded bg-red-50 px-1.5 py-0.5 font-mono text-xs text-red-700 line-through decoration-red-300">{show(r.before)}</span>}</td>
                                <td className="py-2 text-slate-300"><ArrowRight className="h-3.5 w-3.5" /></td>
                                <td className="px-3 py-2">{r.kind !== 'removed' && <span className="break-all rounded bg-green-50 px-1.5 py-0.5 font-mono text-xs text-green-800">{show(r.after)}</span>}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </TabsContent>
                  <TabsContent value="raw">
                    <div className="grid gap-3 md:grid-cols-2">
                      {(['before', 'after'] as const).map((k) => (
                        <div key={k}>
                          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{k === 'before' ? 'Avant' : 'Après'}</p>
                          <pre className={cn('max-h-80 overflow-auto rounded-lg border p-3 text-xs scrollbar-thin', k === 'before' ? 'border-red-100 bg-red-50/40' : 'border-green-100 bg-green-50/40')}>
                            {l[k] == null ? '—' : JSON.stringify(l[k], null, 2)}
                          </pre>
                        </div>
                      ))}
                    </div>
                  </TabsContent>
                </Tabs>
              )}
            </DialogBody>
            <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Fermer</Button></DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
