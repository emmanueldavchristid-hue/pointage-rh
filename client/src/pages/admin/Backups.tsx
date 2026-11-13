import * as React from 'react';
import { Link } from 'react-router-dom';
import { Archive, CalendarClock, CheckCircle2, Download, HardDrive, LifeBuoy, Save, Settings, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  Badge, Button, buttonVariants, Card, CardContent, CardHeader, ConfirmDialog, EmptyState, PageHeader, StatCard, Table, TableBody,
  TableCell, TableContainer, TableEmptyRow, TableHead, TableHeader, TableRow, TableSkeleton,
} from '@/components/ui';
import { Callout, LoadError } from '@/features/admin/shared';
import { formatBytes, useBackups, useCreateBackup, type Backup } from '@/features/admin/api';
import { useSystemSettings } from '@/features/settings/api';
import { downloadFile, errorMessage } from '@/lib/api';
import { formatDateTime, formatRelative } from '@/lib/format';

export default function AdminBackupsPage() {
  const q = useBackups();
  const settings = useSystemSettings();
  const create = useCreateBackup();
  const [confirm, setConfirm] = React.useState(false);
  const [downloading, setDownloading] = React.useState<number | null>(null);
  const items = React.useMemo(() => [...(q.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [q.data]);
  const lastOk = items.find((b) => b.status === 'OK');
  const totalSize = items.filter((b) => b.status === 'OK').reduce((s, b) => s + (b.sizeBytes || 0), 0);
  const cfg = settings.data?.backup;

  async function download(b: Backup) {
    setDownloading(b.id);
    try {
      await downloadFile(`/backups/${b.id}/download`, undefined, b.fileName);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Sauvegardes"
        description="Copies de la base de données réalisées automatiquement ou à la demande."
        actions={<Button leftIcon={<Save />} loading={create.isPending} onClick={() => setConfirm(true)}>Sauvegarder maintenant</Button>}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Dernière sauvegarde réussie" icon={CheckCircle2} tone={lastOk ? 'success' : 'warning'} loading={q.isPending}
          value={lastOk ? formatRelative(lastOk.createdAt) : 'Aucune'} hint={lastOk ? formatDateTime(lastOk.createdAt) : 'Lancez une première sauvegarde.'} />
        <StatCard label="Planification" icon={CalendarClock} tone={cfg?.enabled ? 'brand' : 'warning'} loading={settings.isPending}
          value={settings.isError ? '—' : cfg?.enabled ? 'Active' : 'Désactivée'} hint={cfg ? `cron « ${cfg.cron} » · ${cfg.keep} conservées` : undefined} />
        <StatCard label="Espace occupé" icon={HardDrive} tone="neutral" loading={q.isPending} value={formatBytes(totalSize)} hint={`${items.length} fichier${items.length > 1 ? 's' : ''}`} />
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[1fr_320px]">
        <TableContainer>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Fichier</TableHead>
                <TableHead>Origine</TableHead>
                <TableHead align="right">Taille</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead align="right"><span className="sr-only">Télécharger</span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.isPending ? (
                <TableEmptyRow colSpan={6}><div className="p-4"><TableSkeleton rows={5} cols={5} /></div></TableEmptyRow>
              ) : q.isError ? (
                <TableEmptyRow colSpan={6}><LoadError error={q.error} onRetry={q.refetch} compact /></TableEmptyRow>
              ) : items.length === 0 ? (
                <TableEmptyRow colSpan={6}><EmptyState compact icon={Archive} title="Aucune sauvegarde" description="Lancez une sauvegarde manuelle ou activez la planification." /></TableEmptyRow>
              ) : items.map((b) => (
                <TableRow key={b.id}>
                  <TableCell className="whitespace-nowrap"><p className="tabular text-ink">{formatDateTime(b.createdAt)}</p><p className="text-xs text-muted">{formatRelative(b.createdAt)}</p></TableCell>
                  <TableCell><p className="max-w-[200px] truncate font-mono text-xs text-slate-700" title={b.fileName}>{b.fileName}</p>{b.message && <p className="max-w-[200px] truncate text-xs text-muted" title={b.message}>{b.message}</p>}</TableCell>
                  <TableCell><Badge variant={b.trigger === 'MANUEL' ? 'brand' : 'neutral'}>{b.trigger === 'MANUEL' ? 'Manuelle' : 'Automatique'}</Badge></TableCell>
                  <TableCell align="right" className="whitespace-nowrap">{formatBytes(b.sizeBytes)}</TableCell>
                  <TableCell>{b.status === 'OK' ? <Badge variant="success" dot>Réussie</Badge> : <Badge variant="danger"><XCircle className="h-3 w-3" />Échec</Badge>}</TableCell>
                  <TableCell align="right">
                    {b.status === 'OK' && (
                      <Button variant="ghost" size="sm" leftIcon={<Download />} loading={downloading === b.id} onClick={() => download(b)} aria-label={`Télécharger ${b.fileName}`}><span className="hidden 2xl:inline">Télécharger</span></Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <div className="space-y-4">
          <Card>
            <CardHeader title={<span className="flex items-center gap-2"><LifeBuoy className="h-4 w-4 text-brand" />Restauration</span>} />
            <CardContent className="space-y-3 pt-0 text-sm text-slate-700">
              <p>La restauration se fait sur le serveur, application arrêtée, par un administrateur technique :</p>
              <ol className="list-decimal space-y-1 pl-5 text-[13px]">
                <li>Téléchargez ou localisez le fichier de sauvegarde souhaité.</li>
                <li>Arrêtez le service de l'application.</li>
                <li>Restaurez la base selon la procédure du guide d'installation (section « Sauvegarde et restauration »).</li>
                <li>Redémarrez le service et vérifiez les dernières données.</li>
              </ol>
              <p className="text-xs text-muted">Toute donnée saisie après la sauvegarde restaurée sera perdue.</p>
            </CardContent>
          </Card>
          <Callout tone="warning" title="Conservez une copie hors du serveur">
            Une sauvegarde stockée sur le même serveur ne protège pas d'une panne disque ou d'un vol. Copiez régulièrement un fichier sur un support externe chiffré.
          </Callout>
          <Link to="/admin/settings" className={buttonVariants({ variant: 'outline', size: 'sm', className: 'w-full' })}><Settings />Régler la planification</Link>
        </div>
      </div>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        tone="default"
        title="Lancer une sauvegarde maintenant ?"
        description="La base de données est copiée immédiatement. L'opération peut prendre quelques secondes ; l'application reste utilisable."
        confirmLabel="Sauvegarder"
        onConfirm={() => create.mutateAsync()}
      />
    </div>
  );
}
