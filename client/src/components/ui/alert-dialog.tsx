import * as React from 'react';
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import { AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { Label } from './label';
import { Textarea } from './textarea';

export const AlertDialog = AlertDialogPrimitive.Root;
export const AlertDialogTrigger = AlertDialogPrimitive.Trigger;

export const AlertDialogContent = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Portal>
    <AlertDialogPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
    <AlertDialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-pop focus:outline-none data-[state=open]:animate-zoom-in',
        className,
      )}
      {...props}
    />
  </AlertDialogPrimitive.Portal>
));
AlertDialogContent.displayName = 'AlertDialogContent';

export const AlertDialogTitle = AlertDialogPrimitive.Title;
export const AlertDialogDescription = AlertDialogPrimitive.Description;
export const AlertDialogCancel = AlertDialogPrimitive.Cancel;
export const AlertDialogAction = AlertDialogPrimitive.Action;

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 'danger' : bouton rouge + icône d'alerte (défaut) ; 'default' : bouton bleu. */
  tone?: 'danger' | 'default';
  /** Affiche un champ « Motif ». */
  withReason?: boolean;
  /** Motif obligatoire (longueur minimale `reasonMinLength`, défaut 5). */
  reasonRequired?: boolean;
  reasonMinLength?: number;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  /** Appelé avec le motif saisi ; peut renvoyer une Promise (bouton en chargement, fermeture au succès). */
  onConfirm: (reason: string) => void | Promise<unknown>;
  loading?: boolean;
  children?: React.ReactNode;
}

/** Confirmation des actions sensibles, avec motif optionnel ou obligatoire. */
export function ConfirmDialog({
  open, onOpenChange, title, description, confirmLabel = 'Confirmer', cancelLabel = 'Annuler', tone = 'danger',
  withReason, reasonRequired, reasonMinLength = 5, reasonLabel = 'Motif', reasonPlaceholder = 'Précisez le motif de cette action…',
  onConfirm, loading, children,
}: ConfirmDialogProps) {
  const [reason, setReason] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [touched, setTouched] = React.useState(false);
  const showReason = withReason || reasonRequired;
  const invalid = !!reasonRequired && reason.trim().length < reasonMinLength;

  React.useEffect(() => {
    if (open) { setReason(''); setTouched(false); setBusy(false); }
  }, [open]);

  async function handleConfirm() {
    setTouched(true);
    if (invalid) return;
    try {
      setBusy(true);
      await onConfirm(reason.trim());
      onOpenChange(false);
    } catch {
      /* l'erreur est affichée par l'appelant (toast) ; on garde la boîte ouverte */
    } finally {
      setBusy(false);
    }
  }

  const Icon = tone === 'danger' ? AlertTriangle : Info;
  const isLoading = loading || busy;

  return (
    <AlertDialog open={open} onOpenChange={(o) => !isLoading && onOpenChange(o)}>
      <AlertDialogContent>
        <div className="flex gap-4 px-6 pb-4 pt-6">
          <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-brand-50 text-brand')}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <AlertDialogTitle className="text-base font-semibold text-ink">{title}</AlertDialogTitle>
            {description && <AlertDialogDescription className="text-sm text-muted">{description}</AlertDialogDescription>}
            {children}
            {showReason && (
              <div className="space-y-1.5 pt-2">
                <Label htmlFor="confirm-reason" required={reasonRequired}>{reasonLabel}</Label>
                <Textarea
                  id="confirm-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  onBlur={() => setTouched(true)}
                  placeholder={reasonPlaceholder}
                  aria-invalid={touched && invalid}
                  autoFocus
                />
                {touched && invalid && (
                  <p className="text-xs text-danger">Le motif doit contenir au moins {reasonMinLength} caractères.</p>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4 sm:flex-row sm:justify-end">
          <AlertDialogCancel asChild>
            <Button variant="outline" disabled={isLoading}>{cancelLabel}</Button>
          </AlertDialogCancel>
          <Button variant={tone === 'danger' ? 'destructive' : 'default'} loading={isLoading} onClick={handleConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}
