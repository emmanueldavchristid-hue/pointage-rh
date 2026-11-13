import * as React from 'react';
import { toast } from 'sonner';
import { ArrowRight, ExternalLink, LogIn, LogOut, Plus } from 'lucide-react';
import { Badge, Button, FormField, Input, Select, Skeleton } from '@/components/ui';
import { QueryError } from '@/features/employee/components/QueryError';
import { errorMessage } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useCreateLocation, useLocationsList, type LocationType, type QrLocation } from '../api';
import { CopyButton } from './CopyButton';
import { BackButton, StepShell } from './StepShell';

const DEFS: Record<LocationType, { code: string; label: string; title: string }> = {
  ENTREE: { code: 'QR_ENTREE', label: 'Entrée principale', title: "QR Code d'entrée" },
  SORTIE: { code: 'QR_SORTIE', label: 'Sortie principale', title: 'QR Code de sortie' },
};

export const absoluteUrl = (u: string) => (/^https?:/.test(u) ? u : `${window.location.origin}${u.startsWith('/') ? '' : '/'}${u}`);

function ExistingLocation({ loc }: { loc: QrLocation }) {
  const url = loc.displayUrl ? absoluteUrl(loc.displayUrl) : null;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium text-ink">{loc.label}</span>
        <Badge variant="outline" className="font-mono">{loc.code}</Badge>
        <Badge variant={loc.mode === 'DYNAMIQUE' ? 'info' : 'neutral'}>{loc.mode === 'DYNAMIQUE' ? `Dynamique · ${loc.rotationSeconds} s` : 'Statique (imprimé)'}</Badge>
        {!loc.active && <Badge variant="warning">Inactif</Badge>}
      </div>
      {url ? (
        <div>
          <p className="mb-1.5 text-xs font-medium text-muted">Lien de la borne (à ouvrir en plein écran sur la tablette)</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input readOnly value={url} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} aria-label={`Lien de borne ${loc.label}`} />
            <div className="flex shrink-0 gap-2">
              <CopyButton text={url} />
              <a href={url} target="_blank" rel="noreferrer" className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-medium text-ink shadow-xs hover:bg-slate-50">
                <ExternalLink className="h-4 w-4" aria-hidden /> Ouvrir
              </a>
            </div>
          </div>
          <p className="mt-1.5 text-xs text-muted">Ce lien contient une clé secrète : ne le communiquez qu'aux personnes qui installent la borne.</p>
        </div>
      ) : (
        <p className="text-xs text-muted">QR Code statique : imprimez l'affiche depuis « QR Codes & bornes ».</p>
      )}
    </div>
  );
}

function CreateLocation({ type }: { type: LocationType }) {
  const create = useCreateLocation();
  const [label, setLabel] = React.useState(DEFS[type].label);
  const [mode, setMode] = React.useState('DYNAMIQUE');
  const [rotation, setRotation] = React.useState(30);
  const valid = label.trim().length >= 2 && (mode !== 'DYNAMIQUE' || (rotation >= 10 && rotation <= 3600));

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <FormField label="Libellé" htmlFor={`label-${type}`} className="sm:col-span-1">
          <Input id={`label-${type}`} value={label} onChange={(e) => setLabel(e.target.value)} />
        </FormField>
        <FormField label="Mode" htmlFor={`mode-${type}`} hint={mode === 'DYNAMIQUE' ? 'Recommandé : code tournant sur écran, inutilisable en photo.' : 'Affiche imprimée, moins sécurisée.'}>
          <Select id={`mode-${type}`} value={mode} onValueChange={setMode} options={[{ value: 'DYNAMIQUE', label: 'Dynamique (borne)' }, { value: 'STATIQUE', label: 'Statique (imprimé)' }]} />
        </FormField>
        {mode === 'DYNAMIQUE' && (
          <FormField label="Rotation" htmlFor={`rot-${type}`} hint="Entre 10 et 3 600 secondes.">
            <Input id={`rot-${type}`} type="number" inputMode="numeric" min={10} max={3600} value={Number.isFinite(rotation) ? rotation : ''} onChange={(e) => setRotation(e.target.valueAsNumber)} />
          </FormField>
        )}
      </div>
      <Button
        leftIcon={<Plus />}
        loading={create.isPending}
        disabled={!valid}
        onClick={() =>
          create.mutate(
            { code: DEFS[type].code, label: label.trim(), type, mode, rotationSeconds: mode === 'DYNAMIQUE' ? rotation : 30, active: true },
            { onSuccess: () => toast.success(`${DEFS[type].title} créé.`), onError: (e) => toast.error(errorMessage(e)) },
          )
        }
      >
        Créer le {DEFS[type].title}
      </Button>
    </div>
  );
}

export function StepLocations({ onDone, onBack }: { onDone: () => void; onBack?: () => void }) {
  const q = useLocationsList();
  const find = (t: LocationType) => (q.data ?? []).find((l) => l.type === t && l.active) ?? (q.data ?? []).find((l) => l.type === t);
  const entry = find('ENTREE');
  const exit = find('SORTIE');
  const complete = !!entry && !!exit;

  return (
    <StepShell
      title="QR Codes de localisation"
      description="Un QR Code ENTRÉE et un QR Code SORTIE, affichés sur des bornes (tablettes ou écrans) à l'accueil. Les employés les scannent avec leur téléphone."
      footer={<><BackButton onClick={onBack} /><Button size="lg" rightIcon={<ArrowRight />} disabled={!complete} onClick={onDone}>Continuer</Button></>}
    >
      {q.isPending ? (
        <div className="space-y-3"><Skeleton className="h-32" /><Skeleton className="h-32" /></div>
      ) : q.isError ? (
        <QueryError error={q.error} onRetry={q.refetch} />
      ) : (
        <div className="space-y-4">
          {(['ENTREE', 'SORTIE'] as const).map((t) => {
            const loc = t === 'ENTREE' ? entry : exit;
            const Icon = t === 'ENTREE' ? LogIn : LogOut;
            return (
              <section key={t} className="rounded-xl border border-slate-200 p-4" aria-labelledby={`loc-${t}`}>
                <div className="mb-3 flex items-center gap-3">
                  <span className={cn('flex h-9 w-9 items-center justify-center rounded-lg text-white', t === 'ENTREE' ? 'bg-brand' : 'bg-danger')}>
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <h3 id={`loc-${t}`} className="flex-1 text-sm font-semibold text-ink">{DEFS[t].title}</h3>
                  {loc ? <Badge variant="success" dot>Configuré</Badge> : <Badge variant="warning" dot>À créer</Badge>}
                </div>
                {loc ? <ExistingLocation loc={loc} /> : <CreateLocation type={t} />}
              </section>
            );
          })}
          {!complete && <p className="text-xs text-muted">Créez les deux QR Codes pour passer à l'étape suivante.</p>}
        </div>
      )}
    </StepShell>
  );
}
