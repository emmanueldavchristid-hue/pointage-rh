import * as React from 'react';
import { toast } from 'sonner';
import { AlertTriangle, ArrowRight, Network, Plus, Wifi, X } from 'lucide-react';
import { Button, Input, Skeleton, Switch } from '@/components/ui';
import { QueryError } from '@/features/employee/components/QueryError';
import { errorMessage } from '@/lib/api';
import { useSaveSystemSettings, useSystemSettings } from '../api';
import { BackButton, SectionTitle, StepShell } from './StepShell';

/** Validation CIDR IPv4 / IPv6 (le serveur revalide). Renvoie la forme normalisée ou un message d'erreur. */
export function parseCidr(raw: string): { value?: string; error?: string } {
  const v = raw.trim();
  if (!v) return { error: 'Saisissez une plage réseau.' };
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?:\/(\d{1,2}))?$/.exec(v);
  if (v4) {
    if (v4.slice(1, 5).some((o) => Number(o) > 255)) return { error: 'Adresse IPv4 invalide (chaque nombre va de 0 à 255).' };
    const prefix = v4[5] === undefined ? 32 : Number(v4[5]);
    if (prefix > 32) return { error: 'Préfixe IPv4 invalide (0 à 32).' };
    return { value: `${v4.slice(1, 5).map(Number).join('.')}/${prefix}` };
  }
  const v6 = /^([0-9a-fA-F:]+)(?:\/(\d{1,3}))?$/.exec(v);
  if (v6 && v6[1].includes(':')) {
    const prefix = v6[2] === undefined ? 128 : Number(v6[2]);
    if (prefix > 128) return { error: 'Préfixe IPv6 invalide (0 à 128).' };
    return { value: `${v6[1].toLowerCase()}/${prefix}` };
  }
  return { error: 'Format attendu : 192.168.1.0/24 (ou une adresse IPv6).' };
}

export function StepNetwork({ onDone, onBack }: { onDone: () => void; onBack?: () => void }) {
  const q = useSystemSettings();
  const save = useSaveSystemSettings();
  const [networks, setNetworks] = React.useState<string[]>([]);
  const [enforce, setEnforce] = React.useState(true);
  const [draft, setDraft] = React.useState('');
  const [draftError, setDraftError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!q.data) return;
    setNetworks(q.data.clocking?.allowedNetworks ?? []);
    setEnforce(q.data.clocking?.enforceNetwork ?? true);
  }, [q.data]);

  const add = () => {
    const r = parseCidr(draft);
    if (r.error) return setDraftError(r.error);
    if (networks.includes(r.value!)) return setDraftError('Cette plage est déjà dans la liste.');
    setNetworks((n) => [...n, r.value!]);
    setDraft('');
    setDraftError(null);
  };

  const submit = async () => {
    if (!q.data) return;
    if (enforce && networks.length === 0) return toast.error('Ajoutez au moins une plage réseau, ou désactivez le contrôle du réseau.');
    try {
      await save.mutateAsync({ ...q.data, clocking: { ...q.data.clocking, allowedNetworks: networks, enforceNetwork: enforce } });
      toast.success('Réseau local enregistré.');
      onDone();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <StepShell
      title="Réseau local autorisé"
      description="Pour éviter les pointages à distance, l'application peut n'accepter les scans que depuis le Wi-Fi ou le réseau de l'entreprise."
      footer={<><BackButton onClick={onBack} /><Button size="lg" rightIcon={<ArrowRight />} loading={save.isPending} disabled={!q.data} onClick={submit}>Enregistrer et continuer</Button></>}
    >
      {q.isPending ? (
        <div className="space-y-3"><Skeleton className="h-16" /><Skeleton className="h-24" /></div>
      ) : q.isError ? (
        <QueryError error={q.error} onRetry={q.refetch} />
      ) : (
        <div className="space-y-6">
          <div className="flex items-start gap-3 rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm text-brand-800">
            <Wifi className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <div className="space-y-1 leading-relaxed">
              <p>Chaque plage s'écrit au format CIDR : <span className="font-mono">192.168.1.0/24</span> couvre les adresses 192.168.1.0 à 192.168.1.255.</p>
              <p>Votre prestataire informatique peut vous indiquer la plage de votre Wi-Fi. Une adresse seule est acceptée et convertie en /32.</p>
            </div>
          </div>

          <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 p-4">
            <div>
              <p className="text-sm font-medium text-ink">Contrôler le réseau lors du pointage</p>
              <p className="text-xs leading-relaxed text-muted">Activé : un scan venant d'un autre réseau est refusé et signalé comme anomalie.</p>
            </div>
            <Switch checked={enforce} onCheckedChange={setEnforce} aria-label="Contrôler le réseau lors du pointage" />
          </div>

          <div>
            <SectionTitle>Plages autorisées</SectionTitle>
            {networks.length === 0 ? (
              <p className="mb-3 flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-3 text-sm text-muted">
                <Network className="h-4 w-4" aria-hidden /> Aucune plage pour le moment.
              </p>
            ) : (
              <ul className="mb-3 flex flex-wrap gap-2">
                {networks.map((n) => (
                  <li key={n} className="inline-flex h-10 items-center gap-1 rounded-full border border-slate-200 bg-white pl-3.5 pr-1 font-mono text-[13px] text-ink shadow-xs">
                    {n}
                    <button type="button" onClick={() => setNetworks((all) => all.filter((x) => x !== n))} className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-danger" aria-label={`Retirer ${n}`}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <Input
                value={draft}
                onChange={(e) => { setDraft(e.target.value); setDraftError(null); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
                placeholder="ex. 192.168.1.0/24"
                className="font-mono"
                aria-label="Nouvelle plage réseau"
                aria-invalid={!!draftError}
              />
              <Button variant="outline" leftIcon={<Plus />} onClick={add}>Ajouter</Button>
            </div>
            {draftError && <p className="mt-1.5 text-xs font-medium text-danger" role="alert">{draftError}</p>}
          </div>

          {enforce && networks.length === 0 && (
            <p className="flex items-start gap-2 text-sm text-warning-strong">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> Avec le contrôle activé et aucune plage, tous les pointages seraient refusés.
            </p>
          )}
        </div>
      )}
    </StepShell>
  );
}
