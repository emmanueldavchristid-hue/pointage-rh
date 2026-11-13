import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui';
import { ChangePasswordForm } from './ChangePasswordForm';

export function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Changer le mot de passe</DialogTitle>
          <DialogDescription>Choisissez un mot de passe personnel que vous êtes seul à connaître.</DialogDescription>
        </DialogHeader>
        <DialogBody className="pb-6">
          <ChangePasswordForm onSuccess={() => onOpenChange(false)} />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
