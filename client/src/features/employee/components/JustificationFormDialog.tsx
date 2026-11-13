import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Upload } from 'lucide-react';
import {
  Button, DatePicker, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  FormField, Textarea,
} from '@/components/ui';
import { errorMessage, isApiError } from '@/lib/api';
import { todayISO } from '@/lib/format';
import { useCreateJustification } from '../api';
import { FilePicker, validateUpload } from './FilePicker';

const schema = z.object({
  workDate: z.string().min(1, 'Indiquez la date concernée.'),
  reason: z.string().trim().min(5, 'Décrivez le motif (5 caractères minimum).').max(1000, '1 000 caractères maximum.'),
});
type Values = z.infer<typeof schema>;

export function JustificationFormDialog({ open, onOpenChange, initialDate }: { open: boolean; onOpenChange: (o: boolean) => void; initialDate?: string }) {
  const create = useCreateJustification();
  const [file, setFile] = React.useState<File | null>(null);
  const [fileError, setFileError] = React.useState<string | null>(null);
  const { register, control, handleSubmit, reset, setError, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { workDate: initialDate ?? todayISO(), reason: '' },
  });

  React.useEffect(() => {
    if (open) reset({ workDate: initialDate ?? todayISO(), reason: '' });
    else { setFile(null); setFileError(null); }
  }, [open, initialDate, reset]);

  const onSubmit = handleSubmit(async (v) => {
    if (!file) return setFileError('Joignez le justificatif (PDF, JPG ou PNG).');
    const fe = validateUpload(file);
    if (fe) return setFileError(fe);
    try {
      await create.mutateAsync({ workDate: v.workDate, reason: v.reason.trim(), file });
      toast.success('Justificatif déposé. Les RH vont l\'examiner.');
      onOpenChange(false);
    } catch (e) {
      if (isApiError(e) && e.status === 422 && Object.keys(e.fieldErrors).length) {
        Object.entries(e.fieldErrors).forEach(([k, m]) => (k === 'file' ? setFileError(m) : setError(k as keyof Values, { message: m })));
      } else toast.error(errorMessage(e));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Déposer un justificatif</DialogTitle>
          <DialogDescription>Certificat médical, convocation, attestation… Une fois validé, la journée est requalifiée en absence justifiée.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate>
          <DialogBody className="space-y-4">
            <FormField label="Date concernée" htmlFor="workDate" error={errors.workDate} required>
              <Controller control={control} name="workDate" render={({ field }) => (
                <DatePicker id="workDate" className="h-11" value={field.value} onChange={field.onChange} max={todayISO()} aria-invalid={!!errors.workDate} />
              )} />
            </FormField>
            <FormField label="Motif" htmlFor="reason" error={errors.reason} required>
              <Textarea id="reason" rows={3} placeholder="Ex. : consultation médicale" {...register('reason')} aria-invalid={!!errors.reason} />
            </FormField>
            <FormField label="Fichier" htmlFor="just-file" error={fileError} required>
              <FilePicker id="just-file" file={file} onChange={(f) => { setFile(f); setFileError(validateUpload(f)); }} error={fileError} />
            </FormField>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="lg" onClick={() => onOpenChange(false)}>Annuler</Button>
            <Button type="submit" size="lg" leftIcon={<Upload />} loading={isSubmitting}>Déposer</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
