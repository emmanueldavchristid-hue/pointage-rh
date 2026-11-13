import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';
import { Save, Send } from 'lucide-react';
import {
  Button, DatePicker, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  FormField, Select, Skeleton, Textarea,
} from '@/components/ui';
import { errorMessage, isApiError } from '@/lib/api';
import { todayISO } from '@/lib/format';
import { useCreateLeave, useLeaveTypes } from '../api';
import { FilePicker, validateUpload } from './FilePicker';
import { QueryError } from './QueryError';

const schema = z
  .object({
    leaveTypeId: z.string().min(1, 'Choisissez le type de demande.'),
    startDate: z.string().min(1, 'Indiquez la date de début.'),
    endDate: z.string().min(1, 'Indiquez la date de fin.'),
    comment: z.string().max(1000, '1 000 caractères maximum.').optional(),
  })
  .refine((v) => !v.startDate || !v.endDate || v.endDate >= v.startDate, {
    path: ['endDate'],
    message: 'La date de fin doit être postérieure ou égale à la date de début.',
  });
type Values = z.infer<typeof schema>;

export function LeaveFormDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const types = useLeaveTypes();
  const create = useCreateLeave();
  const [file, setFile] = React.useState<File | null>(null);
  const [fileError, setFileError] = React.useState<string | null>(null);
  const [mode, setMode] = React.useState<'draft' | 'send' | null>(null);
  const { register, control, handleSubmit, watch, reset, setError, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { leaveTypeId: '', startDate: todayISO(), endDate: todayISO(), comment: '' },
  });

  React.useEffect(() => {
    if (!open) {
      reset({ leaveTypeId: '', startDate: todayISO(), endDate: todayISO(), comment: '' });
      setFile(null);
      setFileError(null);
    }
  }, [open, reset]);

  const activeTypes = (types.data ?? []).filter((t) => t.active !== false);
  const selectedType = activeTypes.find((t) => String(t.id) === watch('leaveTypeId'));

  const save = (draft: boolean) =>
    handleSubmit(async (v) => {
      const fe = validateUpload(file);
      if (fe) return setFileError(fe);
      setMode(draft ? 'draft' : 'send');
      try {
        await create.mutateAsync({
          leaveTypeId: Number(v.leaveTypeId),
          startDate: v.startDate,
          endDate: v.endDate,
          comment: v.comment?.trim() || undefined,
          draft,
          file,
        });
        toast.success(draft ? 'Brouillon enregistré.' : 'Demande envoyée. Vous serez notifié de la décision.');
        onOpenChange(false);
      } catch (e) {
        if (isApiError(e) && e.status === 422 && Object.keys(e.fieldErrors).length) {
          Object.entries(e.fieldErrors).forEach(([k, m]) => {
            if (k === 'file') setFileError(m);
            else setError(k as keyof Values, { message: m });
          });
        } else toast.error(errorMessage(e));
      } finally {
        setMode(null);
      }
    })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Nouvelle demande</DialogTitle>
          <DialogDescription>Congé, permission ou autre absence. Votre responsable puis les RH seront notifiés.</DialogDescription>
        </DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); void save(false); }} noValidate>
          <DialogBody className="space-y-4">
            {types.isPending ? (
              <Skeleton className="h-10" />
            ) : types.isError ? (
              <QueryError error={types.error} onRetry={types.refetch} />
            ) : (
              <FormField label="Type de demande" htmlFor="leaveTypeId" error={errors.leaveTypeId} required>
                <Controller
                  control={control}
                  name="leaveTypeId"
                  render={({ field }) => (
                    <Select
                      id="leaveTypeId"
                      value={field.value}
                      onValueChange={field.onChange}
                      placeholder="Choisir…"
                      aria-invalid={!!errors.leaveTypeId}
                      className="h-11"
                      options={activeTypes.map((t) => ({ value: String(t.id), label: t.label }))}
                    />
                  )}
                />
              </FormField>
            )}
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Du" htmlFor="startDate" error={errors.startDate} required>
                <Controller control={control} name="startDate" render={({ field }) => (
                  <DatePicker id="startDate" className="h-11" value={field.value} onChange={field.onChange} aria-invalid={!!errors.startDate} />
                )} />
              </FormField>
              <FormField label="Au" htmlFor="endDate" error={errors.endDate} required>
                <Controller control={control} name="endDate" render={({ field }) => (
                  <DatePicker id="endDate" className="h-11" value={field.value} onChange={field.onChange} aria-invalid={!!errors.endDate} />
                )} />
              </FormField>
            </div>
            <FormField label="Commentaire" htmlFor="comment" error={errors.comment} hint="Facultatif : précisez le motif si utile.">
              <Textarea id="comment" rows={3} {...register('comment')} />
            </FormField>
            <FormField
              label="Justificatif"
              htmlFor="leave-file"
              error={fileError}
              hint={selectedType?.requiresJustification ? 'Ce type de demande nécessite un justificatif : joignez-le maintenant ou plus tard.' : 'Facultatif.'}
            >
              <FilePicker id="leave-file" file={file} onChange={(f) => { setFile(f); setFileError(validateUpload(f)); }} error={fileError} />
            </FormField>
          </DialogBody>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button variant="outline" size="lg" leftIcon={<Save />} loading={mode === 'draft'} disabled={mode !== null} onClick={() => void save(true)}>
              Enregistrer en brouillon
            </Button>
            <Button type="submit" size="lg" leftIcon={<Send />} loading={mode === 'send'} disabled={mode !== null}>
              Envoyer la demande
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
