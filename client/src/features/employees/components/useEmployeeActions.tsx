import * as React from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ui';
import { errorMessage } from '@/lib/api';
import type { Employee } from '@/lib/types';
import { useResetPassword, useToggleEmployee } from '../api';
import { CredentialsDialog, type Credentials } from './CredentialsDialog';
import { EmployeeFormDialog } from './EmployeeFormDialog';

type Pending = { kind: 'toggle' | 'reset'; employee: Employee } | null;

/** Actions sensibles sur un employé (désactivation/réactivation, mot de passe, édition) avec leurs boîtes de dialogue. */
export function useEmployeeActions() {
  const [pending, setPending] = React.useState<Pending>(null);
  const [editing, setEditing] = React.useState<Employee | null | undefined>(undefined); // undefined = fermé, null = création
  const [creds, setCreds] = React.useState<Credentials | null>(null);
  const toggle = useToggleEmployee();
  const reset = useResetPassword();
  const emp = pending?.employee;
  const isActive = emp?.status === 'ACTIVE' || emp?.status === 'ACTIF';

  const dialogs = (
    <>
      <EmployeeFormDialog
        open={editing !== undefined}
        onOpenChange={(o) => !o && setEditing(undefined)}
        employee={editing ?? null}
        onCreated={setCreds}
      />
      <CredentialsDialog value={creds} onClose={() => setCreds(null)} />
      <ConfirmDialog
        open={pending?.kind === 'toggle'}
        onOpenChange={(o) => !o && setPending(null)}
        title={isActive ? `Désactiver ${emp?.fullName} ?` : `Réactiver ${emp?.fullName} ?`}
        description={isActive
          ? 'Le compte ne pourra plus se connecter ni pointer. L’historique est conservé et l’action est tracée.'
          : 'Le compte pourra de nouveau se connecter et pointer.'}
        confirmLabel={isActive ? 'Désactiver' : 'Réactiver'}
        tone={isActive ? 'danger' : 'default'}
        reasonRequired
        onConfirm={async (reason) => {
          if (!emp) return;
          try {
            await toggle.mutateAsync({ id: emp.id, active: !isActive, reason });
            toast.success(isActive ? 'Employé désactivé.' : 'Employé réactivé.');
          } catch (e) { toast.error(errorMessage(e)); throw e; }
        }}
      />
      <ConfirmDialog
        open={pending?.kind === 'reset'}
        onOpenChange={(o) => !o && setPending(null)}
        title="Réinitialiser le mot de passe ?"
        description={`Un mot de passe temporaire sera généré pour ${emp?.fullName ?? ''}. L’ancien ne fonctionnera plus.`}
        confirmLabel="Réinitialiser"
        tone="default"
        onConfirm={async () => {
          if (!emp) return;
          try {
            const r = await reset.mutateAsync(emp.id);
            setCreds({ title: 'Mot de passe réinitialisé', name: emp.fullName, login: r.login, password: r.temporaryPassword });
          } catch (e) { toast.error(errorMessage(e)); throw e; }
        }}
      />
    </>
  );

  return {
    dialogs,
    create: () => setEditing(null),
    edit: (e: Employee) => setEditing(e),
    toggle: (e: Employee) => setPending({ kind: 'toggle', employee: e }),
    resetPassword: (e: Employee) => setPending({ kind: 'reset', employee: e }),
  };
}

export const isEmployeeActive = (e: Pick<Employee, 'status'>) => e.status === 'ACTIVE' || e.status === 'ACTIF';
