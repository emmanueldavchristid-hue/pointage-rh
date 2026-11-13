import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Button, DatePicker, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, FormField, Input, Select,
} from '@/components/ui';
import { isApiError } from '@/lib/api';
import { CONTRACT_TYPE, ROLE_LABELS } from '@/lib/labels';
import type { Employee, Role } from '@/lib/types';
import { useAuth } from '@/features/auth/AuthProvider';
import { useDepartments, useEmployeeOptions, usePositions } from '@/features/org/api';
import { useSaveEmployee, type EmployeeInput } from '../api';
import type { Credentials } from './CredentialsDialog';

const CONTRACTS = ['CDI', 'CDD', 'STAGE', 'INTERIM', 'CONSULTANT', 'AUTRE'] as const;
const dateOrEmpty = z.string().refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), 'Date invalide.');

const schema = z.object({
  matricule: z.string().trim().min(1, 'Le matricule est obligatoire.').max(30, '30 caractères maximum.'),
  lastName: z.string().trim().min(1, 'Le nom est obligatoire.').max(80, '80 caractères maximum.'),
  firstNames: z.string().trim().min(1, 'Le ou les prénoms sont obligatoires.').max(120, '120 caractères maximum.'),
  email: z.string().trim().max(160).refine((v) => !v || z.email().safeParse(v).success, 'Adresse e-mail invalide.'),
  phone: z.string().trim().max(40, '40 caractères maximum.'),
  gender: z.string(),
  birthDate: dateOrEmpty,
  departmentId: z.string(),
  positionId: z.string(),
  hireDate: dateOrEmpty,
  contractType: z.enum(CONTRACTS, { message: 'Type de contrat invalide.' }),
  managerId: z.string(),
  role: z.enum(['SUPER_ADMIN', 'HR_ADMIN', 'MANAGER', 'EMPLOYEE']),
});
type Values = z.infer<typeof schema>;

function toValues(e?: Employee | null): Values {
  return {
    matricule: e?.matricule ?? '', lastName: e?.lastName ?? '', firstNames: e?.firstNames ?? '', email: e?.email ?? '', phone: e?.phone ?? '',
    gender: e?.gender ?? '', birthDate: e?.birthDate ?? '', departmentId: e?.departmentId ? String(e.departmentId) : '',
    positionId: e?.positionId ? String(e.positionId) : '', hireDate: e?.hireDate ?? '',
    contractType: (CONTRACTS as readonly string[]).includes(e?.contractType ?? '') ? (e!.contractType as Values['contractType']) : 'CDI',
    managerId: e?.managerId ? String(e.managerId) : '', role: e?.role ?? 'EMPLOYEE',
  };
}

const num = (v: string) => (v ? Number(v) : null);

/** Création / modification d'un employé (EmployeeInput + rôle). */
export function EmployeeFormDialog({
  open, onOpenChange, employee, onCreated,
}: { open: boolean; onOpenChange: (o: boolean) => void; employee?: Employee | null; onCreated?: (c: Credentials) => void }) {
  const { role: myRole } = useAuth();
  const editing = !!employee;
  const deps = useDepartments();
  const positions = usePositions();
  const emps = useEmployeeOptions(open);
  const mut = useSaveEmployee();
  const { register, control, handleSubmit, watch, setValue, setError, reset, formState: { errors } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: toValues(employee),
  });
  React.useEffect(() => { if (open) reset(toValues(employee)); }, [open, employee, reset]);

  const depId = watch('departmentId');
  const posOptions = (positions.data ?? [])
    .filter((p) => !depId || !p.departmentId || String(p.departmentId) === depId)
    .map((p) => ({ value: String(p.id), label: p.title }));
  const depOptions = (deps.data ?? []).filter((d) => d.active || String(d.id) === depId).map((d) => ({ value: String(d.id), label: d.name }));
  const mgrOptions = (emps.data ?? []).filter((e) => e.id !== employee?.id && e.status === 'ACTIVE').map((e) => ({ value: String(e.id), label: `${e.fullName} · ${e.matricule}` }));
  const roleChoices: Role[] = myRole === 'SUPER_ADMIN' ? ['EMPLOYEE', 'MANAGER', 'HR_ADMIN', 'SUPER_ADMIN'] : ['EMPLOYEE', 'MANAGER'];
  const currentRole = watch('role');
  const roleOptions = Array.from(new Set([...roleChoices, currentRole])).map((r) => ({ value: r, label: ROLE_LABELS[r], disabled: !roleChoices.includes(r) }));

  async function onSubmit(v: Values) {
    const data: EmployeeInput = {
      matricule: v.matricule.trim(), lastName: v.lastName.trim(), firstNames: v.firstNames.trim(),
      email: v.email.trim() || null, phone: v.phone.trim() || null, gender: (v.gender || null) as EmployeeInput['gender'],
      birthDate: v.birthDate || null, departmentId: num(v.departmentId), positionId: num(v.positionId), hireDate: v.hireDate || null,
      contractType: v.contractType, managerId: num(v.managerId),
    };
    if (!editing || v.role !== employee?.role) data.role = v.role;
    try {
      const r = await mut.mutateAsync({ id: employee?.id, data });
      onOpenChange(false);
      if (!editing && r.initialPassword) {
        onCreated?.({ title: 'Employé créé', name: r.employee.fullName, login: r.login ?? r.employee.email ?? r.employee.matricule, password: r.initialPassword });
      }
    } catch (e) {
      if (isApiError(e) && e.status === 422) Object.entries(e.fieldErrors).forEach(([k, m]) => setError(k as keyof Values, { message: m }));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex min-h-0 flex-col">
          <DialogHeader>
            <DialogTitle>{editing ? `Modifier ${employee?.fullName}` : 'Nouvel employé'}</DialogTitle>
            <DialogDescription>
              {editing ? 'Les modifications sont enregistrées dans le journal d’audit.' : 'Un compte de connexion est créé automatiquement (identifiant : e-mail, sinon matricule).'}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-6">
            <section className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Identité</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Matricule" htmlFor="emp-matricule" error={errors.matricule} required>
                  <Input id="emp-matricule" autoComplete="off" className="uppercase" {...register('matricule')} aria-invalid={!!errors.matricule} />
                </FormField>
                <FormField label="Genre" htmlFor="emp-gender" error={errors.gender}>
                  <Controller control={control} name="gender" render={({ field }) => (
                    <Select id="emp-gender" value={field.value} onValueChange={field.onChange} allLabel="Non renseigné" options={[{ value: 'M', label: 'Homme' }, { value: 'F', label: 'Femme' }]} />
                  )} />
                </FormField>
                <FormField label="Nom" htmlFor="emp-lastName" error={errors.lastName} required>
                  <Input id="emp-lastName" {...register('lastName')} aria-invalid={!!errors.lastName} />
                </FormField>
                <FormField label="Prénoms" htmlFor="emp-firstNames" error={errors.firstNames} required>
                  <Input id="emp-firstNames" {...register('firstNames')} aria-invalid={!!errors.firstNames} />
                </FormField>
                <FormField label="Date de naissance" htmlFor="emp-birthDate" error={errors.birthDate}>
                  <Controller control={control} name="birthDate" render={({ field }) => <DatePicker id="emp-birthDate" value={field.value} onChange={field.onChange} />} />
                </FormField>
              </div>
            </section>
            <section className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Coordonnées</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="E-mail" htmlFor="emp-email" error={errors.email}>
                  <Input id="emp-email" type="email" autoComplete="off" {...register('email')} aria-invalid={!!errors.email} />
                </FormField>
                <FormField label="Téléphone" htmlFor="emp-phone" error={errors.phone}>
                  <Input id="emp-phone" type="tel" placeholder="+225 07 00 00 00 00" {...register('phone')} />
                </FormField>
              </div>
            </section>
            <section className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Poste et contrat</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField label="Département" htmlFor="emp-dep" error={errors.departmentId}>
                  <Controller control={control} name="departmentId" render={({ field }) => (
                    <Select id="emp-dep" value={field.value} allLabel="Aucun" options={depOptions}
                      onValueChange={(v) => { field.onChange(v); const pos = positions.data?.find((p) => String(p.id) === watch('positionId')); if (pos?.departmentId && String(pos.departmentId) !== v) setValue('positionId', ''); }} />
                  )} />
                </FormField>
                <FormField label="Poste" htmlFor="emp-pos" error={errors.positionId}>
                  <Controller control={control} name="positionId" render={({ field }) => (
                    <Select id="emp-pos" value={field.value} onValueChange={field.onChange} allLabel="Aucun" options={posOptions} />
                  )} />
                </FormField>
                <FormField label="Type de contrat" htmlFor="emp-contract" error={errors.contractType} required>
                  <Controller control={control} name="contractType" render={({ field }) => (
                    <Select id="emp-contract" value={field.value} onValueChange={field.onChange} options={CONTRACTS.map((c) => ({ value: c, label: CONTRACT_TYPE[c] ?? 'Autre' }))} />
                  )} />
                </FormField>
                <FormField label="Date d'embauche" htmlFor="emp-hire" error={errors.hireDate}>
                  <Controller control={control} name="hireDate" render={({ field }) => <DatePicker id="emp-hire" value={field.value} onChange={field.onChange} />} />
                </FormField>
                <FormField label="Supérieur hiérarchique" htmlFor="emp-mgr" error={errors.managerId}>
                  <Controller control={control} name="managerId" render={({ field }) => (
                    <Select id="emp-mgr" value={field.value} onValueChange={field.onChange} allLabel="Aucun" options={mgrOptions} />
                  )} />
                </FormField>
                <FormField label="Rôle dans l'application" htmlFor="emp-role" error={errors.role} required hint={myRole !== 'SUPER_ADMIN' ? 'Les rôles d’administration sont attribués par le super administrateur.' : undefined}>
                  <Controller control={control} name="role" render={({ field }) => (
                    <Select id="emp-role" value={field.value} onValueChange={field.onChange} options={roleOptions} />
                  )} />
                </FormField>
              </div>
            </section>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mut.isPending}>Annuler</Button>
            <Button type="submit" loading={mut.isPending}>{editing ? 'Enregistrer' : 'Créer l’employé'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
