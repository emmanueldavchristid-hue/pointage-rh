import * as React from 'react';
import { KeyRound, LogOut, QrCode, ShieldAlert } from 'lucide-react';
import { Avatar, Badge, Button, Card, CardHeader, Skeleton } from '@/components/ui';
import { displayName, useAuth } from '@/features/auth/AuthProvider';
import { ChangePasswordForm } from '@/features/auth/ChangePasswordForm';
import { useMyQrCode } from '@/features/employee/api';
import { QueryError } from '@/features/employee/components/QueryError';
import { ROLE_LABELS } from '@/lib/labels';

function Info({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium text-ink">{value || '—'}</dd>
    </div>
  );
}

export default function AppProfilePage() {
  const { user, company, logout } = useAuth();
  const qr = useMyQrCode();
  const [showQr, setShowQr] = React.useState(false);
  const [showPwd, setShowPwd] = React.useState(false);
  const [leaving, setLeaving] = React.useState(false);
  const emp = user?.employee;
  const name = displayName(user);

  return (
    <div className="space-y-4">
      <Card className="flex items-center gap-4 p-4">
        <Avatar name={name} src={emp?.photoUrl} size="lg" />
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-ink">{name}</h1>
          <p className="truncate text-sm text-muted">{emp?.positionTitle ?? (user ? ROLE_LABELS[user.role] : '')}</p>
          {emp && <Badge variant="outline" className="mt-1.5 font-mono">{emp.matricule}</Badge>}
        </div>
      </Card>

      <Card>
        <CardHeader title="Mes informations" />
        <dl className="divide-y divide-slate-100 px-4 pb-2">
          <Info label="Matricule" value={emp?.matricule} />
          <Info label="Nom" value={emp?.lastName} />
          <Info label="Prénoms" value={emp?.firstNames} />
          <Info label="Département" value={emp?.departmentName} />
          <Info label="Poste" value={emp?.positionTitle} />
          <Info label="Identifiant de connexion" value={user?.login} />
          <Info label="Entreprise" value={company?.name} />
        </dl>
        <p className="px-4 pb-4 text-xs text-muted">Une information est inexacte ? Contactez le service RH pour la faire corriger.</p>
      </Card>

      <Card>
        <CardHeader title="Mon QR Code personnel" description="Badge de secours, utilisé par les RH si le scan est impossible." />
        <div className="px-4 pb-4">
          <div className="mb-3 flex items-start gap-2.5 rounded-lg border border-warning-border bg-warning-soft px-3 py-2.5 text-[13px] text-amber-900">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p><span className="font-semibold">Strictement personnel : ne le partagez pas.</span> Il permet de vous identifier ; ne l'envoyez à personne et ne le publiez pas.</p>
          </div>
          {!showQr ? (
            <Button variant="outline" block size="lg" leftIcon={<QrCode />} onClick={() => setShowQr(true)}>
              Afficher mon QR Code
            </Button>
          ) : qr.isPending ? (
            <Skeleton className="mx-auto aspect-square w-full max-w-[260px] rounded-xl" />
          ) : qr.isError ? (
            <QueryError error={qr.error} onRetry={qr.refetch} />
          ) : (
            <div className="flex flex-col items-center">
              <img src={qr.data.png} alt="QR Code personnel de secours" className="aspect-square w-full max-w-[260px] rounded-xl border border-slate-200 bg-white p-3" />
              <Button variant="ghost" className="mt-2 min-h-[44px]" onClick={() => setShowQr(false)}>Masquer</Button>
            </div>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader title="Sécurité" description="Changez régulièrement votre mot de passe." />
        <div className="px-4 pb-4">
          {showPwd ? (
            <ChangePasswordForm onSuccess={() => setShowPwd(false)} />
          ) : (
            <Button variant="outline" block size="lg" leftIcon={<KeyRound />} onClick={() => setShowPwd(true)}>
              Changer mon mot de passe
            </Button>
          )}
        </div>
      </Card>

      <Button
        variant="outline"
        block
        size="lg"
        className="border-danger-border text-danger hover:bg-danger-soft hover:text-danger"
        leftIcon={<LogOut />}
        loading={leaving}
        onClick={async () => {
          setLeaving(true);
          try {
            await logout();
          } finally {
            setLeaving(false);
          }
        }}
      >
        Se déconnecter
      </Button>
    </div>
  );
}
