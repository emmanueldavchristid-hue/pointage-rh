import * as React from 'react';
import type { FieldError } from 'react-hook-form';
import { cn } from '@/lib/utils';
import { Label } from './label';

export interface FormFieldProps {
  label?: React.ReactNode;
  /** id du champ (lie label et aria-describedby). */
  htmlFor?: string;
  /** Erreur RHF (`errors.x`) ou message. */
  error?: FieldError | string | null;
  hint?: React.ReactNode;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

/**
 * Label + champ + message d'erreur.
 * <FormField label="Nom" htmlFor="lastName" error={errors.lastName} required>
 *   <Input id="lastName" {...register('lastName')} aria-invalid={!!errors.lastName} />
 * </FormField>
 */
export function FormField({ label, htmlFor, error, hint, required, className, children }: FormFieldProps) {
  const msg = typeof error === 'string' ? error : error?.message;
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && <Label htmlFor={htmlFor} required={required}>{label}</Label>}
      {children}
      {msg ? (
        <p id={htmlFor ? `${htmlFor}-error` : undefined} className="text-xs font-medium text-danger" role="alert">{msg}</p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
