import * as React from 'react';
import { CheckCircle2, Download, FileSpreadsheet, Upload, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui';
import { downloadFile, errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { CopyField } from '@/features/org/components/shared';
import { useImportEmployees, type ImportResult } from '../api';

/** Import Excel : modèle téléchargeable, envoi du fichier, rapport détaillé et mots de passe initiaux. */
export function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [file, setFile] = React.useState<File | null>(null);
  const [result, setResult] = React.useState<ImportResult | null>(null);
  const [drag, setDrag] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const mut = useImportEmployees();

  React.useEffect(() => { if (open) { setFile(null); setResult(null); } }, [open]);

  function pick(f?: File | null) {
    if (!f) return;
    if (!/\.xlsx$/i.test(f.name)) { toast.error('Seuls les fichiers Excel .xlsx sont acceptés.'); return; }
    setFile(f);
  }

  async function submit() {
    if (!file) return;
    try {
      setResult(await mut.mutateAsync(file));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function template() {
    try { await downloadFile('/employees/import-template.xlsx', undefined, 'modele-import-employes.xlsx'); }
    catch (e) { toast.error(errorMessage(e)); }
  }

  const pwds = result?.initialPasswords ?? [];
  const csv = pwds.map((p) => `${p.matricule};${p.password}`).join('\n');

  return (
    <Dialog open={open} onOpenChange={(o) => !mut.isPending && onOpenChange(o)}>
      <DialogContent size="lg" onInteractOutside={(e) => result && e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Importer des employés</DialogTitle>
          <DialogDescription>Utilisez le modèle Excel fourni. Les lignes dont le matricule existe déjà sont ignorées.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {!result ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                <div className="flex items-center gap-2 text-sm text-slate-700"><FileSpreadsheet className="h-4 w-4 text-success" />Modèle d'import avec les colonnes attendues</div>
                <Button variant="outline" size="sm" leftIcon={<Download />} onClick={template}>Télécharger le modèle</Button>
              </div>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]); }}
                className={cn(
                  'flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30',
                  drag ? 'border-brand bg-brand-50/50' : 'border-slate-200 hover:border-slate-300',
                )}
              >
                <Upload className="mb-3 h-6 w-6 text-slate-400" />
                {file ? (
                  <><span className="text-sm font-medium text-ink">{file.name}</span><span className="mt-1 text-xs text-muted">{(file.size / 1024).toFixed(0)} Ko · cliquez pour changer</span></>
                ) : (
                  <><span className="text-sm font-medium text-ink">Déposez le fichier ici ou cliquez pour parcourir</span><span className="mt-1 text-xs text-muted">Format .xlsx</span></>
                )}
              </button>
              <input ref={inputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
            </>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-success-border bg-success-soft p-3"><div className="text-xs text-green-700">Créés</div><div className="text-xl font-semibold tabular text-green-800">{result.created}</div></div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><div className="text-xs text-muted">Ignorés</div><div className="text-xl font-semibold tabular text-ink">{result.skipped}</div></div>
                <div className={cn('rounded-lg border p-3', result.errors.length ? 'border-danger-border bg-danger-soft' : 'border-slate-200 bg-slate-50')}><div className={cn('text-xs', result.errors.length ? 'text-red-700' : 'text-muted')}>Erreurs</div><div className="text-xl font-semibold tabular text-ink">{result.errors.length}</div></div>
              </div>
              {result.errors.length > 0 && (
                <div>
                  <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-ink"><XCircle className="h-4 w-4 text-danger" />Lignes en erreur</h4>
                  <ul className="max-h-40 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200 text-sm">
                    {result.errors.map((er, i) => <li key={i} className="flex gap-3 px-3 py-2"><span className="w-16 shrink-0 font-medium tabular text-muted">Ligne {er.row}</span><span className="text-slate-700">{er.message}</span></li>)}
                  </ul>
                </div>
              )}
              {pwds.length > 0 && (
                <div>
                  <h4 className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-ink"><CheckCircle2 className="h-4 w-4 text-success" />Mots de passe initiaux</h4>
                  <p className="mb-2 text-xs text-muted">Affichés une seule fois. Chaque employé devra changer son mot de passe à la première connexion.</p>
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-slate-50 text-left text-xs text-muted"><tr><th className="px-3 py-2 font-medium">Matricule</th><th className="px-3 py-2 font-medium">Mot de passe</th></tr></thead>
                      <tbody className="divide-y divide-slate-100">
                        {pwds.map((p) => <tr key={p.matricule}><td className="px-3 py-1.5 font-medium">{p.matricule}</td><td className="px-3 py-1.5 font-mono">{p.password}</td></tr>)}
                      </tbody>
                    </table>
                  </div>
                  <div className="mt-3"><CopyField label="Tout copier (matricule;mot de passe)" value={csv} /></div>
                </div>
              )}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          {!result ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mut.isPending}>Annuler</Button>
              <Button onClick={submit} disabled={!file} loading={mut.isPending} leftIcon={<Upload />}>Importer</Button>
            </>
          ) : (
            <Button onClick={() => onOpenChange(false)}>Terminer</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
