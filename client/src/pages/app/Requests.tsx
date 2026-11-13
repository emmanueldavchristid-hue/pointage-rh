import * as React from 'react';
import { CalendarPlus, Download, FilePlus2, FileText, MessageSquareText, Paperclip, Send, XCircle } from 'lucide-react';
import {
  Button, ConfirmDialog, EmptyState, PageHeader, Skeleton, StatusBadge, Tabs, TabsContent, TabsList, TabsTrigger,
} from '@/components/ui';
import { useCancelLeave, useMyJustifications, useMyLeaves, useSubmitLeave } from '@/features/employee/api';
import { JustificationFormDialog } from '@/features/employee/components/JustificationFormDialog';
import { LeaveFormDialog } from '@/features/employee/components/LeaveFormDialog';
import { QueryError } from '@/features/employee/components/QueryError';
import type { Justification, LeaveRequest } from '@/features/employee/types';
import { downloadFile, errorMessage } from '@/lib/api';
import { formatDate, formatDateShort, formatDateTime } from '@/lib/format';
import { toast } from 'sonner';

const DECISION_LABEL: Record<string, string> = {
  FAVORABLE: 'Avis favorable',
  DEFAVORABLE: 'Avis défavorable',
  APPROUVE: 'Approuvée',
  REFUSE: 'Refusée',
};

function ListSkeleton() {
  return <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>;
}

function Opinion({ title, decision, comment, at }: { title: string; decision?: string | null; comment?: string | null; at?: string | null }) {
  if (!decision && !comment) return null;
  const negative = decision === 'DEFAVORABLE' || decision === 'REFUSE';
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2 text-[13px]">
      <p className="flex items-center gap-1.5 font-medium text-ink">
        <MessageSquareText className="h-3.5 w-3.5 text-muted" aria-hidden />
        {title}
        {decision && <span className={negative ? 'text-danger' : 'text-success'}>· {DECISION_LABEL[decision] ?? decision}</span>}
      </p>
      {comment && <p className="mt-0.5 text-slate-600">« {comment} »</p>}
      {at && <p className="mt-0.5 text-[11px] text-slate-400">{formatDateTime(at)}</p>}
    </div>
  );
}

function LeaveCard({ leave, onCancel }: { leave: LeaveRequest; onCancel: (l: LeaveRequest) => void }) {
  const submit = useSubmitLeave();
  const sameDay = leave.startDate === leave.endDate;
  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: leave.leaveType.color ?? '#2563EB' }} aria-hidden />
            <span className="truncate">{leave.leaveType.label}</span>
          </p>
          <p className="mt-1 text-[13px] text-slate-600">
            {sameDay ? `Le ${formatDateShort(leave.startDate)}` : `Du ${formatDateShort(leave.startDate)} au ${formatDateShort(leave.endDate)}`}
            {leave.workingDays > 0 && <span className="text-muted"> · {leave.workingDays} jour{leave.workingDays > 1 ? 's' : ''} ouvré{leave.workingDays > 1 ? 's' : ''}</span>}
          </p>
        </div>
        <StatusBadge kind="leave" value={leave.status} />
      </div>
      {leave.comment && <p className="mt-2 text-[13px] text-slate-600">{leave.comment}</p>}
      {leave.justification && (
        <p className="mt-2 flex items-center gap-1.5 text-[13px] text-slate-600">
          <Paperclip className="h-3.5 w-3.5" aria-hidden /> {leave.justification.fileName}
          <StatusBadge kind="review" value={leave.justification.status} dot={false} className="ml-1" />
        </p>
      )}
      {(leave.managerDecision || leave.managerComment || leave.hrDecidedAt || leave.hrComment) && (
        <div className="mt-3 space-y-2">
          <Opinion title="Avis du responsable" decision={leave.managerDecision} comment={leave.managerComment} at={leave.managerReviewedAt} />
          <Opinion
            title="Décision RH"
            decision={leave.hrDecidedAt ? (leave.status === 'APPROUVE' ? 'APPROUVE' : leave.status === 'REFUSE' ? 'REFUSE' : null) : null}
            comment={leave.hrComment}
            at={leave.hrDecidedAt}
          />
        </div>
      )}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <span className="text-xs text-slate-400">Créée le {formatDate(leave.createdAt)}</span>
        <div className="flex gap-2">
          {leave.canCancel && (
            <Button variant="ghost" size="lg" className="text-danger hover:bg-danger-soft hover:text-danger" leftIcon={<XCircle />} onClick={() => onCancel(leave)}>
              Annuler
            </Button>
          )}
          {leave.status === 'BROUILLON' && (
            <Button size="lg" leftIcon={<Send />} loading={submit.isPending} onClick={() => submit.mutate(leave.id)}>Envoyer</Button>
          )}
        </div>
      </div>
    </li>
  );
}

function JustificationCard({ j }: { j: Justification }) {
  const [busy, setBusy] = React.useState(false);
  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{j.workDate ? `Journée du ${formatDateShort(j.workDate)}` : 'Justificatif'}</p>
          <p className="mt-1 text-[13px] text-slate-600">{j.reason}</p>
        </div>
        <StatusBadge kind="review" value={j.status} />
      </div>
      {j.reviewComment && <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-[13px] text-slate-600">Commentaire RH : « {j.reviewComment} »</p>}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
        <span className="text-xs text-slate-400">Déposé le {formatDate(j.createdAt)}</span>
        {j.hasFile && (
          <Button
            variant="outline"
            size="lg"
            leftIcon={<Download />}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await downloadFile(`/justifications/${j.id}/file`, undefined, j.fileName ?? 'justificatif');
              } catch (e) {
                toast.error(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <span className="max-w-[140px] truncate">{j.fileName ?? 'Fichier'}</span>
          </Button>
        )}
      </div>
    </li>
  );
}

export default function AppRequestsPage() {
  const [tab, setTab] = React.useState('leaves');
  const [leaveOpen, setLeaveOpen] = React.useState(false);
  const [justOpen, setJustOpen] = React.useState(false);
  const [toCancel, setToCancel] = React.useState<LeaveRequest | null>(null);
  const leaves = useMyLeaves();
  const justs = useMyJustifications();
  const cancel = useCancelLeave();

  return (
    <div className="space-y-4">
      <PageHeader title="Mes demandes" description="Congés, permissions et justificatifs d'absence." />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList variant="pills" className="grid w-full grid-cols-2">
          <TabsTrigger value="leaves" className="min-h-[40px]">Congés & permissions</TabsTrigger>
          <TabsTrigger value="justifications" className="min-h-[40px]">Justificatifs</TabsTrigger>
        </TabsList>

        <TabsContent value="leaves" className="mt-4 space-y-3">
          <Button size="xl" block leftIcon={<CalendarPlus />} onClick={() => setLeaveOpen(true)}>Nouvelle demande</Button>
          {leaves.isPending ? <ListSkeleton /> : leaves.isError ? (
            <QueryError error={leaves.error} onRetry={leaves.refetch} />
          ) : (leaves.data.items ?? []).length === 0 ? (
            <EmptyState icon={CalendarPlus} title="Aucune demande" description="Vos demandes de congé et de permission, et leur suivi, apparaîtront ici." />
          ) : (
            <ul className="space-y-2">{leaves.data.items.map((l) => <LeaveCard key={l.id} leave={l} onCancel={setToCancel} />)}</ul>
          )}
        </TabsContent>

        <TabsContent value="justifications" className="mt-4 space-y-3">
          <Button size="xl" block leftIcon={<FilePlus2 />} onClick={() => setJustOpen(true)}>Déposer un justificatif</Button>
          {justs.isPending ? <ListSkeleton /> : justs.isError ? (
            <QueryError error={justs.error} onRetry={justs.refetch} />
          ) : justs.data.length === 0 ? (
            <EmptyState icon={FileText} title="Aucun justificatif" description="Déposez ici un certificat ou une attestation pour justifier une absence ou un retard." />
          ) : (
            <ul className="space-y-2">{justs.data.map((j) => <JustificationCard key={j.id} j={j} />)}</ul>
          )}
        </TabsContent>
      </Tabs>

      <LeaveFormDialog open={leaveOpen} onOpenChange={setLeaveOpen} />
      <JustificationFormDialog open={justOpen} onOpenChange={setJustOpen} />
      <ConfirmDialog
        open={!!toCancel}
        onOpenChange={(o) => !o && setToCancel(null)}
        title="Annuler cette demande ?"
        description={toCancel ? `${toCancel.leaveType.label} du ${formatDateShort(toCancel.startDate)} au ${formatDateShort(toCancel.endDate)}. Cette action est définitive.` : undefined}
        confirmLabel="Annuler la demande"
        onConfirm={async () => {
          if (toCancel) await cancel.mutateAsync(toCancel.id);
          setToCancel(null);
        }}
      />
    </div>
  );
}
