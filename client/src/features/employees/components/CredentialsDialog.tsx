import { KeyRound } from 'lucide-react';
import { Button, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui';
import { CopyField } from '@/features/org/components/shared';

export interface Credentials { title: string; name?: string; login?: string; password: string }

/** Affiche une seule fois l'identifiant et le mot de passe (initial ou temporaire). */
export function CredentialsDialog({ value, onClose }: { value: Credentials | null; onClose: () => void }) {
  return (
    <Dialog open={!!value} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="sm" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand"><KeyRound className="h-5 w-5" /></div>
          <DialogTitle>{value?.title}</DialogTitle>
          <DialogDescription>
            {value?.name ? `${value.name} : ` : ''}ces informations ne seront plus affichées. Transmettez-les à l'employé, qui devra changer son mot de passe à la première connexion.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          {value?.login && <CopyField label="Identifiant" value={value.login} />}
          {value && <CopyField label="Mot de passe" value={value.password} />}
        </DialogBody>
        <DialogFooter>
          <Button onClick={onClose}>J'ai noté ces informations</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
