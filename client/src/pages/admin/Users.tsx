import * as React from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { KeyRound, Lock, MoreHorizontal, Plus, Power, ShieldCheck, UserCog } from 'lucide-react';
import {
  Avatar, Badge, Button, ConfirmDialog, Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, EmptyState, FilterBar, FormField, Input,
  PageHeader, Select, Table, TableBody, TableCell, TableContainer, TableEmptyRow, TableHead, TableHeader, TableRow, TableSkeleton,
} from '@/components/ui';
import { Callout, CopyButton, EmployeePicker, LoadError } from '@/features/admin/shared';
import { useAdminUsers, useCreateUser, useUpdateUser, type AdminUser } from '@/features/admin/api';
import { PasswordInput } from '@/features/auth/ChangePasswordForm';
import { useAuth } from '@/features/auth/AuthProvider';
import { isApiError } from '@/lib/api';
import { formatDateTime, formatRelative, formatTime } from '@/lib/format';
import { ROLE_LABELS } from '@/lib/labels';
import type { Role } from '@/lib/types';

const ADMIN_ROLES: Role[] = ['SUPER_ADMIN', 'HR_ADMIN', 'MANAGER'];
const ROLE_HELP: Record<string, string> = {
  SUPER_ADMIN: 'Accès complet : paramètres, QR codes, utilisateurs, audit, sauvegardes.',
  HR_ADMIN: 'Gestion du personnel, des présences, congés, horaires et rapports.',
  MANAGER: 'Suivi de son département : présences, avis sur les congés, heures sup.',
  EMPLOYEE: 'Pointage et espace personnel uniquement.',
};
const roleVariant = (r: Role) => (r === 'SUPER_ADMIN' ? 'dark' : r === 'HR_ADMIN' ? 'brand' : r === 'MANAGER' ? 'info' : 'neutral') as 'dark' | 'brand' | 'info' | 'neutral';
const isLocked = (u: AdminUser) => !!u.lockedUntil && new Date(u.lockedUntil).getTime() > Date.now();

export default function AdminUsersPage() {
  const { user: me } = useAuth();
  const [role, setRole] = React.useState('');
  const q = useAdminUsers(role);
  const update = useUpdateUser();
  const [createOpen, setCreateOpen] = React.useState(false);
  const [roleEdit, setRoleEdit] = React.useState<AdminUser | null>(null);
  const [toToggle, setToToggle] = React.useState<AdminUser | null>(null);

  return (
    <div>
      <PageHeader
        title="Utilisateurs"
        description="Comptes d'accès à l'administration et rôles associés."
        actions={<Button leftIcon={<Plus />} onClick={() => setCreateOpen(true)}>Nouveau compte</Button>}
      />
      <Callout className="mb-6" icon={ShieldCheck}>
        Les comptes des employés sont créés depuis la fiche employé. Ici, créez les comptes d'administration (RH, responsables,
        super administrateurs) et ajustez les rôles. Limitez le nombre de super administrateurs au strict nécessaire.
      </Callout>
      <TableContainer>
        <FilterBar onReset={() => setRole('')} canReset={!!role}>
          <Select className="sm:w-56" aria-label="Rôle" value={role} onValueChange={setRole} allLabel="Tous les rôles"
            options={(Object.keys(ROLE_LABELS) as Role[]).map((r) => ({ value: r, label: ROLE_LABELS[r] }))} />
        </FilterBar>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Compte</TableHead>
              <TableHead>Rôle</TableHead>
              <TableHead>Fiche employé</TableHead>
              <TableHead>État</TableHead>
              <TableHead>Dernière connexion</TableHead>
              <TableHead align="right"><span className="sr-only">Actions</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.isPending ? (
              <TableEmptyRow colSpan={6}><div className="p-4"><TableSkeleton rows={5} cols={5} /></div></TableEmptyRow>
            ) : q.isError ? (
              <TableEmptyRow colSpan={6}><LoadError error={q.error} onRetry={q.refetch} compact /></TableEmptyRow>
            ) : q.data.length === 0 ? (
              <TableEmptyRow colSpan={6}><EmptyState compact icon={UserCog} title="Aucun compte" description="Aucun compte ne correspond à ce filtre." /></TableEmptyRow>
            ) : q.data.map((u) => {
              const self = u.id === me?.id;
              return (
                <TableRow key={u.id} className={!u.active ? 'opacity-60' : undefined}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar name={u.employeeName ?? u.login} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink">{u.login}{self && <span className="ml-2 text-xs font-normal text-muted">(vous)</span>}</p>
                        <p className="text-xs text-muted">Créé {formatRelative(u.createdAt)}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell><Badge variant={roleVariant(u.role)}>{ROLE_LABELS[u.role] ?? u.role}</Badge></TableCell>
                  <TableCell>{u.employeeName ?? <span className="text-muted">Compte technique</span>}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1.5">
                      {u.active ? <Badge variant="success" dot>Actif</Badge> : <Badge variant="muted" dot>Désactivé</Badge>}
                      {isLocked(u) && <Badge variant="danger" title={`Verrouillé jusqu'au ${formatDateTime(u.lockedUntil)}`}><Lock className="h-3 w-3" />Verrouillé jusqu'à {formatTime(u.lockedUntil)}</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">{u.lastLoginAt ? formatDateTime(u.lastLoginAt) : <span className="text-muted">Jamais</span>}</TableCell>
                  <TableCell align="right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`Actions pour ${u.login}`}><MoreHorizontal /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem icon={<KeyRound />} disabled={self} onSelect={() => setRoleEdit(u)}>Changer le rôle</DropdownMenuItem>
                        <DropdownMenuItem icon={<Power />} destructive={u.active} disabled={self} onSelect={() => setToToggle(u)}>
                          {u.active ? 'Désactiver le compte' : 'Réactiver le compte'}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} />
      <RoleDialog user={roleEdit} onOpenChange={(o) => !o && setRoleEdit(null)} />
      <ConfirmDialog
        open={!!toToggle}
        onOpenChange={(o) => !o && setToToggle(null)}
        tone={toToggle?.active ? 'danger' : 'default'}
        title={toToggle?.active ? `Désactiver le compte « ${toToggle?.login} » ?` : `Réactiver le compte « ${toToggle?.login} » ?`}
        description={toToggle?.active ? 'La personne ne pourra plus se connecter ; ses sessions en cours seront fermées. L\'historique est conservé.' : 'La personne pourra de nouveau se connecter avec son mot de passe.'}
        confirmLabel={toToggle?.active ? 'Désactiver' : 'Réactiver'}
        onConfirm={async () => { if (toToggle) await update.mutateAsync({ id: toToggle.id, active: !toToggle.active }); }}
      />
    </div>
  );
}

const createSchema = z.object({
  login: z.string().trim().min(3, 'Identifiant trop court (3 caractères minimum).').max(120, 'Identifiant trop long.'),
  role: z.enum(['SUPER_ADMIN', 'HR_ADMIN', 'MANAGER']),
  password: z.union([z.literal(''), z.string().min(8, 'Au moins 8 caractères.').regex(/[0-9]/, 'Au moins un chiffre.').regex(/[A-Za-zÀ-ÿ]/, 'Au moins une lettre.')]),
  employeeId: z.number().nullable(),
});
type CreateValues = z.infer<typeof createSchema>;

function CreateUserDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const create = useCreateUser();
  const [created, setCreated] = React.useState<{ login: string; password: string | null } | null>(null);
  const { register, control, handleSubmit, reset, watch, setError, formState: { errors } } = useForm<CreateValues>({
    resolver: zodResolver(createSchema), defaultValues: { login: '', role: 'HR_ADMIN', password: '', employeeId: null },
  });
  React.useEffect(() => { if (open) { reset({ login: '', role: 'HR_ADMIN', password: '', employeeId: null }); setCreated(null); } }, [open, reset]);
  const role = watch('role');

  async function onSubmit(v: CreateValues) {
    try {
      const res = await create.mutateAsync({ login: v.login.trim(), role: v.role, password: v.password || undefined, employeeId: v.employeeId ?? undefined });
      const pwd = res?.initialPassword ?? res?.temporaryPassword ?? res?.password ?? (v.password || null);
      setCreated({ login: v.login.trim(), password: v.password ? null : pwd });
    } catch (e) {
      if (isApiError(e) && e.status === 422) Object.entries(e.fieldErrors).forEach(([k, m]) => setError(k as keyof CreateValues, { message: m }));
      if (isApiError(e) && e.status === 409) setError('login', { message: e.message });
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>Compte créé</DialogTitle>
              <DialogDescription>Transmettez ces informations à la personne de façon confidentielle.</DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-4">
              <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div><p className="text-xs text-muted">Identifiant</p><p className="font-mono text-sm font-medium text-ink">{created.login}</p></div>
                {created.password ? (
                  <div className="flex items-end justify-between gap-3">
                    <div><p className="text-xs text-muted">Mot de passe initial</p><p className="font-mono text-base font-semibold text-ink">{created.password}</p></div>
                    <CopyButton text={created.password} />
                  </div>
                ) : <p className="text-sm text-muted">Mot de passe : celui que vous avez saisi.</p>}
              </div>
              {created.password && <Callout tone="warning">Ce mot de passe ne sera plus affiché. Le changement sera demandé à la première connexion.</Callout>}
            </DialogBody>
            <DialogFooter><Button onClick={() => onOpenChange(false)}>Terminé</Button></DialogFooter>
          </>
        ) : (
          <form noValidate onSubmit={handleSubmit(onSubmit)}>
            <DialogHeader>
              <DialogTitle>Nouveau compte d'administration</DialogTitle>
              <DialogDescription>Le compte peut être lié à une fiche employé pour donner aussi accès au pointage.</DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-4">
              <FormField label="Identifiant de connexion" htmlFor="u-login" error={errors.login} required hint="Adresse e-mail ou identifiant court.">
                <Input id="u-login" autoComplete="off" {...register('login')} aria-invalid={!!errors.login} />
              </FormField>
              <FormField label="Rôle" htmlFor="u-role" error={errors.role} required hint={ROLE_HELP[role]}>
                <Controller control={control} name="role" render={({ field }) => (
                  <Select id="u-role" value={field.value} onValueChange={field.onChange} options={ADMIN_ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] }))} />
                )} />
              </FormField>
              <FormField label="Fiche employé liée" htmlFor="u-emp" hint={role === 'MANAGER' ? 'Recommandé pour un responsable : détermine son département.' : 'Facultatif.'}>
                <Controller control={control} name="employeeId" render={({ field }) => (
                  <div className="flex gap-1">
                    <EmployeePicker id="u-emp" className="flex-1" value={field.value ? [field.value] : []} onChange={(ids) => field.onChange(ids[0] ?? null)} placeholder="Aucune (compte technique)" />
                    {field.value && <Button type="button" variant="ghost" size="icon" onClick={() => field.onChange(null)} aria-label="Retirer la fiche liée">×</Button>}
                  </div>
                )} />
              </FormField>
              <FormField label="Mot de passe" htmlFor="u-pwd" error={errors.password} hint="Laissez vide pour générer un mot de passe initial.">
                <PasswordInput id="u-pwd" autoComplete="new-password" {...register('password')} aria-invalid={!!errors.password} />
              </FormField>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
              <Button type="submit" loading={create.isPending}>Créer le compte</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RoleDialog({ user, onOpenChange }: { user: AdminUser | null; onOpenChange: (o: boolean) => void }) {
  const update = useUpdateUser();
  const [role, setRole] = React.useState<Role>('HR_ADMIN');
  React.useEffect(() => { if (user) setRole(user.role); }, [user]);
  const options = (user?.employeeId ? [...ADMIN_ROLES, 'EMPLOYEE' as Role] : ADMIN_ROLES).map((r) => ({ value: r, label: ROLE_LABELS[r] }));
  return (
    <Dialog open={!!user} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Changer le rôle</DialogTitle>
          <DialogDescription>{user?.login}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <Select aria-label="Rôle" value={role} onValueChange={(v) => setRole(v as Role)} options={options} />
          <p className="text-sm text-muted">{ROLE_HELP[role]}</p>
          {role === 'SUPER_ADMIN' && user?.role !== 'SUPER_ADMIN' && <Callout tone="warning">Ce rôle donne un accès complet, y compris à la révocation des QR codes et aux sauvegardes.</Callout>}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Annuler</Button>
          <Button disabled={!user || role === user.role} loading={update.isPending}
            onClick={async () => { if (!user) return; try { await update.mutateAsync({ id: user.id, role }); onOpenChange(false); } catch { /* toast */ } }}>
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
