import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ExternalLink, Eye, FileDown, KeyRound, LogIn, LogOut, MonitorSmartphone, MoreHorizontal, Pencil, Plus, Printer, QrCode,
  RefreshCw, ArrowLeftRight, ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  Badge, Button, ConfirmDialog, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, EmptyState, FormField, Input,
  Label, PageHeader, Select, Skeleton, Spinner, Switch, Table, TableBody, TableCell, TableContainer, TableEmptyRow, TableHead,
  TableHeader, TableRow, TableSkeleton,
} from '@/components/ui';
import { Callout, CopyButton, LoadError, NumberInput } from '@/features/admin/shared';
import {
  LOCATION_MODE, LOCATION_TYPE, useLocations, useRotateLocationSecret, useSaveLocation, type QrLocation,
} from '@/features/admin/api';
import { api, downloadFile, errorMessage, isApiError } from '@/lib/api';
import { formatTime } from '@/lib/format';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

const kioskUrl = (l: QrLocation) => (l.displayUrl ? new URL(l.displayUrl, window.location.origin).toString() : '');
const typeIcon = { ENTREE: LogIn, SORTIE: LogOut, MIXTE: ArrowLeftRight } as const;

export default function AdminLocationsPage() {
  const q = useLocations();
  const rotate = useRotateLocationSecret();
  const save = useSaveLocation();
  const [edit, setEdit] = React.useState<QrLocation | 'new' | null>(null);
  const [toRotate, setToRotate] = React.useState<QrLocation | null>(null);
  const [toToggle, setToToggle] = React.useState<QrLocation | null>(null);
  const [kiosk, setKiosk] = React.useState<QrLocation | null>(null);
  const [printing, setPrinting] = React.useState<number | null>(null);

  async function printPdf(l: QrLocation) {
    try {
      setPrinting(l.id);
      await downloadFile(`/locations/${l.id}/print.pdf`, undefined, `qr-${l.code}.pdf`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setPrinting(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="QR Codes & bornes"
        description="Emplacements de pointage : bornes à QR dynamique ou affiches à QR statique."
        actions={<Button leftIcon={<Plus />} onClick={() => setEdit('new')}>Nouvel emplacement</Button>}
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <Callout icon={ShieldCheck} title="Mode DYNAMIQUE — recommandé">
          Une borne (tablette, écran) affiche un QR qui change toutes les N secondes. Une photo du QR devient inutilisable après
          quelques secondes, ce qui empêche le pointage à distance. Le lien de borne contient une clé secrète : ne le partagez pas.
        </Callout>
        <Callout tone="warning" icon={Printer} title="Mode STATIQUE — à réserver aux cas sans écran">
          Le QR est imprimé et ne change jamais : il peut être photographié et réutilisé hors site. Combinez-le avec la restriction
          réseau (Paramètres › Pointage) et régénérez le secret en cas de doute.
        </Callout>
      </div>

      <TableContainer>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Emplacement</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead>Rotation</TableHead>
              <TableHead>État</TableHead>
              <TableHead>Lien de borne</TableHead>
              <TableHead align="right"><span className="sr-only">Actions</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.isPending ? (
              <TableEmptyRow colSpan={7}><div className="p-4"><TableSkeleton rows={3} cols={6} /></div></TableEmptyRow>
            ) : q.isError ? (
              <TableEmptyRow colSpan={7}><LoadError error={q.error} onRetry={q.refetch} compact /></TableEmptyRow>
            ) : q.data.length === 0 ? (
              <TableEmptyRow colSpan={7}>
                <EmptyState compact icon={QrCode} title="Aucun emplacement" description="Créez au moins un QR d'entrée et un QR de sortie."
                  action={<Button size="sm" leftIcon={<Plus />} onClick={() => setEdit('new')}>Nouvel emplacement</Button>} />
              </TableEmptyRow>
            ) : q.data.map((l) => {
              const Icon = typeIcon[l.type] ?? QrCode;
              const url = kioskUrl(l);
              return (
                <TableRow key={l.id} className={cn(!l.active && 'opacity-60')}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><Icon className="h-4 w-4" /></span>
                      <div>
                        <p className="font-medium text-ink">{l.label}</p>
                        <p className="font-mono text-xs text-muted">{l.code}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{LOCATION_TYPE[l.type] ?? l.type}</TableCell>
                  <TableCell>
                    <Badge variant={l.mode === 'DYNAMIQUE' ? 'success' : 'warning'}>{l.mode === 'DYNAMIQUE' ? 'Dynamique' : 'Statique'}</Badge>
                  </TableCell>
                  <TableCell className="tabular">{l.mode === 'DYNAMIQUE' ? `${l.rotationSeconds} s` : '—'}</TableCell>
                  <TableCell>{l.active ? <Badge variant="success" dot>Actif</Badge> : <Badge variant="muted" dot>Inactif</Badge>}</TableCell>
                  <TableCell>
                    {l.mode === 'DYNAMIQUE' && url ? (
                      <div className="flex items-center gap-1">
                        <CopyButton text={url} size="icon-sm" variant="ghost" label="Copier le lien de borne" />
                        <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100" aria-label="Ouvrir la borne dans un nouvel onglet">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                        <Button variant="ghost" size="sm" onClick={() => setKiosk(l)}>Détails</Button>
                      </div>
                    ) : l.mode === 'STATIQUE' ? (
                      <Button variant="outline" size="sm" leftIcon={<FileDown />} loading={printing === l.id} onClick={() => printPdf(l)}>Affiche PDF</Button>
                    ) : <span className="text-muted">—</span>}
                  </TableCell>
                  <TableCell align="right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`Actions pour ${l.label}`}><MoreHorizontal /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem icon={<Pencil />} onSelect={() => setEdit(l)}>Modifier</DropdownMenuItem>
                        {l.mode === 'DYNAMIQUE' && <DropdownMenuItem icon={<MonitorSmartphone />} onSelect={() => setKiosk(l)}>Lien de borne</DropdownMenuItem>}
                        {l.mode === 'STATIQUE' && <DropdownMenuItem icon={<Printer />} onSelect={() => printPdf(l)}>Imprimer l'affiche (PDF)</DropdownMenuItem>}
                        <DropdownMenuItem icon={<RefreshCw />} onSelect={() => setToToggle(l)}>{l.active ? 'Désactiver' : 'Réactiver'}</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem icon={<KeyRound />} destructive onSelect={() => setToRotate(l)}>Révoquer et régénérer</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <LocationDialog value={edit} onOpenChange={(o) => !o && setEdit(null)} />
      <KioskDialog location={kiosk} onOpenChange={(o) => !o && setKiosk(null)} onPrint={printPdf} />

      <ConfirmDialog
        open={!!toRotate}
        onOpenChange={(o) => !o && setToRotate(null)}
        title={`Révoquer et régénérer « ${toRotate?.label ?? ''} » ?`}
        description="Tous les QR codes imprimés et tous les liens de borne existants pour cet emplacement cessent immédiatement de fonctionner. Il faudra réimprimer l'affiche ou reconfigurer chaque borne avec le nouveau lien."
        confirmLabel="Révoquer et régénérer"
        reasonRequired
        reasonLabel={`Saisissez le code « ${toRotate?.code ?? ''} » pour confirmer`}
        reasonPlaceholder={toRotate?.code}
        reasonMinLength={toRotate?.code.length ?? 2}
        onConfirm={async (typed) => {
          if (!toRotate) return;
          if (typed !== toRotate.code) {
            toast.error('Le code saisi ne correspond pas.');
            throw new Error('mismatch');
          }
          await rotate.mutateAsync(toRotate.id);
        }}
      />
      <ConfirmDialog
        open={!!toToggle}
        onOpenChange={(o) => !o && setToToggle(null)}
        tone={toToggle?.active ? 'danger' : 'default'}
        title={toToggle?.active ? `Désactiver « ${toToggle?.label} » ?` : `Réactiver « ${toToggle?.label} » ?`}
        description={toToggle?.active ? 'Les scans de ce QR seront refusés tant que l\'emplacement est inactif.' : 'Les scans de ce QR seront de nouveau acceptés.'}
        confirmLabel={toToggle?.active ? 'Désactiver' : 'Réactiver'}
        onConfirm={async () => {
          if (!toToggle) return;
          const { id, code, label, type, mode, rotationSeconds, active } = toToggle;
          await save.mutateAsync({ id, code, label, type, mode, rotationSeconds, active: !active });
        }}
      />
    </div>
  );
}

const schema = z.object({
  code: z.string().trim().min(2, 'Code trop court (2 caractères minimum).').max(40, 'Code trop long.').regex(/^[A-Z0-9_-]+$/, 'Majuscules, chiffres, « _ » ou « - » uniquement.'),
  label: z.string().trim().min(2, 'Libellé trop court.').max(80, 'Libellé trop long.'),
  type: z.enum(['ENTREE', 'SORTIE', 'MIXTE']),
  mode: z.enum(['DYNAMIQUE', 'STATIQUE']),
  rotationSeconds: z.number({ error: 'Nombre requis.' }).int().min(15, 'Minimum 15 secondes.').max(3600, 'Maximum 3 600 secondes.'),
  active: z.boolean(),
});
type Values = z.infer<typeof schema>;

function LocationDialog({ value, onOpenChange }: { value: QrLocation | 'new' | null; onOpenChange: (o: boolean) => void }) {
  const save = useSaveLocation();
  const editing = value && value !== 'new' ? value : null;
  const defaults: Values = editing
    ? { code: editing.code, label: editing.label, type: editing.type, mode: editing.mode, rotationSeconds: editing.rotationSeconds, active: editing.active }
    : { code: '', label: '', type: 'ENTREE', mode: 'DYNAMIQUE', rotationSeconds: 30, active: true };
  const { register, control, handleSubmit, reset, watch, setError, formState: { errors } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });
  React.useEffect(() => { if (value) reset(defaults); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const mode = watch('mode');

  async function onSubmit(v: Values) {
    try {
      await save.mutateAsync({ ...v, id: editing?.id });
      onOpenChange(false);
    } catch (e) {
      if (isApiError(e) && e.status === 422) Object.entries(e.fieldErrors).forEach(([k, m]) => setError(k as keyof Values, { message: m }));
      if (isApiError(e) && e.status === 409) setError('code', { message: e.message });
    }
  }

  return (
    <Dialog open={!!value} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <form noValidate onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>{editing ? `Modifier « ${editing.label} »` : 'Nouvel emplacement'}</DialogTitle>
            <DialogDescription>Un emplacement correspond à un point de scan (porte d'entrée, sortie, atelier…).</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Code" htmlFor="l-code" error={errors.code} required hint="Ex. QR_ENTREE_ATELIER">
                <Input id="l-code" className="font-mono uppercase" {...register('code', { setValueAs: (v: string) => v.toUpperCase().trim() })} aria-invalid={!!errors.code} />
              </FormField>
              <FormField label="Libellé" htmlFor="l-label" error={errors.label} required>
                <Input id="l-label" placeholder="Ex. Entrée atelier" {...register('label')} aria-invalid={!!errors.label} />
              </FormField>
              <FormField label="Type" htmlFor="l-type" error={errors.type} required>
                <Controller control={control} name="type" render={({ field }) => (
                  <Select id="l-type" value={field.value} onValueChange={field.onChange} options={Object.entries(LOCATION_TYPE).map(([v, label]) => ({ value: v, label }))} />
                )} />
              </FormField>
              <FormField label="Mode" htmlFor="l-mode" error={errors.mode} required>
                <Controller control={control} name="mode" render={({ field }) => (
                  <Select id="l-mode" value={field.value} onValueChange={field.onChange} options={Object.entries(LOCATION_MODE).map(([v, label]) => ({ value: v, label }))} />
                )} />
              </FormField>
            </div>
            {mode === 'DYNAMIQUE' ? (
              <FormField label="Rotation du QR" htmlFor="l-rot" error={errors.rotationSeconds} hint="Durée de validité de chaque QR affiché (15 s minimum, 30 s conseillé)." className="max-w-[240px]">
                <NumberInput id="l-rot" unit="s" min={15} {...register('rotationSeconds', { valueAsNumber: true })} aria-invalid={!!errors.rotationSeconds} />
              </FormField>
            ) : (
              <Callout tone="warning">Le QR statique est imprimé une fois pour toutes : toute personne qui le photographie peut le réutiliser.</Callout>
            )}
            <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
              <div>
                <Label htmlFor="l-active">Emplacement actif</Label>
                <p className="text-xs text-muted">Inactif : les scans sont refusés.</p>
              </div>
              <Controller control={control} name="active" render={({ field }) => <Switch id="l-active" checked={field.value} onCheckedChange={field.onChange} />} />
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
            <Button type="submit" loading={save.isPending}>{editing ? 'Enregistrer' : 'Créer'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface KioskToken { payload: string; expiresAt: string; rotationSeconds: number; label: string; png: string }

function KioskDialog({ location: l, onOpenChange, onPrint }: { location: QrLocation | null; onOpenChange: (o: boolean) => void; onPrint: (l: QrLocation) => void }) {
  const [preview, setPreview] = React.useState(false);
  React.useEffect(() => { setPreview(false); }, [l?.id]);
  const key = l?.displayUrl ? new URL(l.displayUrl, window.location.origin).searchParams.get('k') : null;
  const token = useQuery({
    queryKey: ['locations', 'kiosk-preview', l?.code, key],
    queryFn: ({ signal }) => api.get<KioskToken>(`/kiosk/${encodeURIComponent(l!.code)}/token`, { k: key }, signal),
    enabled: !!l && !!key && preview,
    refetchInterval: (query) => ((query.state.data?.rotationSeconds ?? 30) * 1000),
    meta: { silent: true },
  });
  const url = l ? kioskUrl(l) : '';

  return (
    <Dialog open={!!l} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        {l && (
          <>
            <DialogHeader>
              <DialogTitle>Lien de borne — {l.label}</DialogTitle>
              <DialogDescription>Ouvrez ce lien en plein écran sur la tablette ou l'écran installé à l'emplacement.</DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="break-all font-mono text-xs text-slate-700">{url || 'Lien indisponible'}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <CopyButton text={url} label="Copier le lien" />
                <a href={url} target="_blank" rel="noopener noreferrer"><Button variant="outline" size="sm" leftIcon={<ExternalLink />}>Ouvrir dans un nouvel onglet</Button></a>
                {l.mode === 'STATIQUE' && <Button variant="outline" size="sm" leftIcon={<Printer />} onClick={() => onPrint(l)}>Affiche PDF</Button>}
                <Button variant="ghost" size="sm" leftIcon={<Eye />} onClick={() => setPreview((p) => !p)}>{preview ? "Masquer l'aperçu" : 'Aperçu du QR affiché'}</Button>
              </div>
              {preview && (
                <div className="flex flex-col items-center rounded-xl border border-slate-200 p-4">
                  {token.isPending ? <Skeleton className="h-48 w-48" /> : token.isError ? (
                    <p className="text-sm text-muted">{errorMessage(token.error)}</p>
                  ) : (
                    <>
                      <img src={token.data.png} alt={`QR de pointage actuel pour ${l.label}`} className="h-48 w-48" />
                      <p className="mt-2 flex items-center gap-2 text-xs text-muted">
                        {token.isFetching && <Spinner className="h-3 w-3" />}
                        Valide jusqu'à {formatTime(token.data.expiresAt)} · renouvelé toutes les {token.data.rotationSeconds} s
                      </p>
                    </>
                  )}
                </div>
              )}
              <Callout tone="warning" title="Lien confidentiel">
                Ce lien contient la clé de la borne. Quiconque le possède peut afficher le QR à distance. En cas de fuite, utilisez « Révoquer et régénérer ».
              </Callout>
            </DialogBody>
            <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Fermer</Button></DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
