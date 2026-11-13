import * as React from 'react';
import { FileText, Paperclip, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export const ALLOWED_MIME = ['application/pdf', 'image/jpeg', 'image/png'];
export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** Contrôle client (le serveur revalide) : pdf/jpg/png ≤ 5 Mo. */
export function validateUpload(file: File | null | undefined): string | null {
  if (!file) return null;
  const okType = ALLOWED_MIME.includes(file.type) || /\.(pdf|jpe?g|png)$/i.test(file.name);
  if (!okType) return 'Format non accepté : PDF, JPG ou PNG uniquement.';
  if (file.size > MAX_FILE_BYTES) return 'Fichier trop volumineux : 5 Mo maximum.';
  return null;
}

const fmtSize = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} Ko` : `${(b / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`);

export function FilePicker({ id, file, onChange, error }: { id: string; file: File | null; onChange: (f: File | null) => void; error?: string | null }) {
  const ref = React.useRef<HTMLInputElement>(null);
  return (
    <div>
      <input
        ref={ref}
        id={id}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
        className="sr-only"
        aria-invalid={!!error}
        onChange={(e) => {
          onChange(e.target.files?.[0] ?? null);
          e.target.value = '';
        }}
      />
      {file ? (
        <div className={cn('flex min-h-[48px] items-center gap-3 rounded-lg border bg-white px-3 py-2', error ? 'border-danger' : 'border-slate-200')}>
          <FileText className="h-5 w-5 shrink-0 text-brand" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{file.name}</p>
            <p className="text-xs text-muted">{fmtSize(file.size)}</p>
          </div>
          <button type="button" onClick={() => onChange(null)} className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Retirer le fichier">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => ref.current?.click()}
          className={cn('flex min-h-[56px] w-full items-center justify-center gap-2 rounded-lg border border-dashed px-3 text-sm font-medium text-slate-600 transition-colors hover:border-brand hover:bg-brand-50/50 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30', error ? 'border-danger' : 'border-slate-300')}
        >
          <Paperclip className="h-4 w-4" aria-hidden /> Joindre un fichier (PDF, JPG, PNG · 5 Mo max.)
        </button>
      )}
    </div>
  );
}
