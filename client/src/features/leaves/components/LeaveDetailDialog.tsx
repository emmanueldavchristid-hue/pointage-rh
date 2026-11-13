import * as React from 'react';
import { Check, CheckCircle2, Circle, Download, FileText, Gavel, MessageSquare, ThumbsDown, ThumbsUp, UserCheck, X, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import {
  Avatar, Badge, Button, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle, Label, StatusBadge, Textarea,
} from '@/components/ui';
import { downloadFile, errorMessage } from '@/lib/api';
import { formatDateLong, formatDateShort, formatDateTime, formatNumber } from '@/lib/format';
import { REVIEW_STATUS, labelOf } from '@/lib/labels';
import { cn } from '@/lib/utils';
import { useDecideLeave, useManagerReview, type LeaveRequest } from '../api';

export function TypeDot({ color, className }: { color?: string | null; className?: string }) {
  return <span className={cn('inline-block h-2.5 w-2.5 shrink-0 rounded-full', className)} style={{ backgroundColor: color || '#94A3B8' }} aria-hidden />;
}

export async function downloadJustification(l: LeaveRequest) {
  if (!l.justification) return;
  try {
    await downloadFile(`/justifications/${l.justification.id}/file`, undefined, l.justification.fileName || 'justificatif');
  } catch (e) {
    toast.error(errorMessage(e));
  }
}

type StepState = 'done' | 'current' | 'pending' | 'negative' | 'skipped';

/** Timeline : création → avis responsable → décision RH. */
export function LeaveTimeline({ l }: { l: LeaveRequest }) {
  const closed = l.status === 'APPROUVE' || l.status === 'REFUSE' || l.status === 'ANNULE';
  const managerState: StepState = l.managerDecision === 'FAVORABLE' ? 'done' : l.managerDecision === 'DEFAVORABLE' ? 'negative' : closed ? 'skipped' : 'current';
  const hrState: StepState = l.status === 'APPROUVE' ? 'done' : l.status === 'REFUSE' ? 'negative' : l.status === 'ANNULE' ? 'skipped' : l.managerDecision || !l.canManagerReview ? 'current' : 'pending';
  const steps: { title: string; state: StepState; date?: string | null; text?: React.ReactNode; comment?: string | null; icon: typeof Circle }[] = [
    { title: 'Demande créée', state: 'done', date: l.createdAt, text: l.status === 'BROUILLON' ? 'Brouillon non soumis' : 'Soumise par l\'employé', comment: l.comment, icon: FileText },
    {
      title: 'Avis du responsable', state: managerState, date: l.managerReviewedAt, icon: UserCheck,
      text: l.managerDecision === 'FAVORABLE' ? 'Avis favorable' : l.managerDecision === 'DEFAVORABLE' ? 'Avis défavorable' : managerState === 'skipped' ? 'Sans avis du responsable' : 'En attente de l\'avis',
      comment: l.managerComment,
    },
    {
      title: 'Décision RH', state: hrState, date: l.hrDecidedAt, icon: Gavel,
      text: l.status === 'APPROUVE' ? 'Approuvée' : l.status === 'REFUSE' ? 'Refusée' : l.status === 'ANNULE' ? 'Demande annulée' : 'En attente de décision',
      comment: l.hrComment,
    },
  ];
  const tone: Record<StepState, string> = {
    done: 'bg-success text-white', current: 'bg-warning-soft text-warning-strong ring-2 ring-warning-border', pending: 'bg-slate-100 text-slate-400',
    negative: 'bg-danger text-white', skipped: 'bg-slate-100 text-slate-400',
  };
  return (
    <ol className="space-y-0">
      {steps.map((s, i) => {
        const Icon = s.state === 'done' ? Check : s.state === 'negative' ? X : s.icon;
        return (
          <li key={s.title} className="relative flex gap-3 pb-5 last:pb-0">
            {i < steps.length - 1 && <span className={cn('absolute left-[15px] top-8 h-[calc(100%-2rem)] w-px', s.state === 'done' ? 'bg-success' : 'bg-slate-200')} aria-hidden />}
            <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', tone[s.state])}><Icon className="h-4 w-4" /></span>
            <div className="min-w-0 flex-1 pt-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p className="text-sm font-semibold text-ink">{s.title}</p>
                {s.date && <p className="text-xs text-muted tabular">{formatDateTime(s.date)}</p>}
              </div>
              <p className={cn('text-sm', s.state === 'negative' ? 'text-red-700' : s.state === 'done' ? 'text-green-700' : 'text-muted')}>{s.text}</p>
              {s.comment && (
                <p className="mt-1.5 flex gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700"><MessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />{s.comment}</p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function LeaveDetailDialog({ leave: l, onOpenChange }: { leave: LeaveRequest | null; onOpenChange: (o: boolean) => void }) {
  const review = useManagerReview();
  const decide = useDecideLeave();
  const [comment, setComment] = React.useState('');
  const [pending, setPending] = React.useState<string | null>(null);
  React.useEffect(() => { setComment(''); setPending(null); }, [l?.id]);

  async function act(kind: 'FAVORABLE' | 'DEFAVORABLE' | 'APPROUVE' | 'REFUSE') {
    if (!l) return;
    if ((kind === 'DEFAVORABLE' || kind === 'REFUSE') && comment.trim().length < 3) {
      toast.error('Merci de motiver un avis défavorable ou un refus dans le commentaire.');
      return;
    }
    setPending(kind);
    try {
      if (kind === 'FAVORABLE' || kind === 'DEFAVORABLE') await review.mutateAsync({ id: l.id, decision: kind, comment: comment.trim() || undefined });
      else await decide.mutateAsync({ id: l.id, decision: kind, comment: comment.trim() || undefined });
      onOpenChange(false);
    } catch {
      /* toast automatique */
    } finally {
      setPending(null);
    }
  }

  const canAct = !!l && (l.canManagerReview || l.canDecide);

  return (
    <Dialog open={!!l} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        {l && (
          <>
            <DialogHeader>
              <div className="flex items-center gap-3">
                <Avatar name={l.employee.fullName} src={l.employee.photoUrl ?? undefined} size="md" />
                <div className="min-w-0">
                  <DialogTitle className="truncate">{l.employee.fullName}</DialogTitle>
                  <p className="text-sm text-muted">{l.employee.matricule}{l.employee.departmentName ? ` · ${l.employee.departmentName}` : ''}</p>
                </div>
                <StatusBadge kind="leave" value={l.status} className="ml-auto" />
              </div>
            </DialogHeader>
            <DialogBody className="space-y-6">
              <div className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-3">
                <div>
                  <p className="text-xs text-muted">Type</p>
                  <p className="mt-0.5 flex items-center gap-2 text-sm font-medium text-ink"><TypeDot color={l.leaveType.color} />{l.leaveType.label}</p>
                </div>
                <div>
                  <p className="text-xs text-muted">Période</p>
                  <p className="mt-0.5 text-sm font-medium text-ink">{formatDateShort(l.startDate)} → {formatDateShort(l.endDate)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted">Jours ouvrés</p>
                  <p className="mt-0.5 text-sm font-semibold text-ink tabular">{formatNumber(l.workingDays, 1)} j</p>
                </div>
              </div>

              <div className="grid gap-6 md:grid-cols-[1fr_240px]">
                <div>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">Circuit de validation</p>
                  <LeaveTimeline l={l} />
                </div>
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">Justificatif</p>
                  {l.justification ? (
                    <div className="rounded-lg border border-slate-200 p-3">
                      <p className="flex items-center gap-2 truncate text-sm font-medium text-ink"><FileText className="h-4 w-4 shrink-0 text-slate-400" /><span className="truncate">{l.justification.fileName}</span></p>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <Badge variant={l.justification.status === 'VALIDE' ? 'success' : l.justification.status === 'REJETE' ? 'danger' : 'warning'}>{labelOf(REVIEW_STATUS, l.justification.status)}</Badge>
                        <Button variant="ghost" size="sm" leftIcon={<Download />} onClick={() => downloadJustification(l)}>Télécharger</Button>
                      </div>
                    </div>
                  ) : (
                    <p className="rounded-lg border border-dashed border-slate-300 p-3 text-sm text-muted">
                      {l.leaveType.requiresJustification ? 'Justificatif requis mais non fourni.' : 'Aucun justificatif (non requis).'}
                    </p>
                  )}
                  <p className="text-xs text-muted">Du {formatDateLong(l.startDate)} au {formatDateLong(l.endDate)}.</p>
                </div>
              </div>

              {canAct && (
                <div className="space-y-2 rounded-xl border border-brand-200 bg-brand-50/40 p-4">
                  <Label htmlFor="lv-comment">{l.canDecide ? 'Commentaire de la décision' : 'Commentaire de votre avis'}</Label>
                  <Textarea id="lv-comment" rows={3} value={comment} onChange={(e) => setComment(e.target.value)}
                    placeholder="Obligatoire en cas d'avis défavorable ou de refus ; visible par l'employé." />
                </div>
              )}
            </DialogBody>
            <DialogFooter>
              {l.canManagerReview && (
                <>
                  <Button variant="outline" leftIcon={<ThumbsDown />} loading={pending === 'DEFAVORABLE'} disabled={!!pending} onClick={() => act('DEFAVORABLE')}>Avis défavorable</Button>
                  <Button variant="success" leftIcon={<ThumbsUp />} loading={pending === 'FAVORABLE'} disabled={!!pending} onClick={() => act('FAVORABLE')}>Avis favorable</Button>
                </>
              )}
              {l.canDecide && (
                <>
                  <Button variant="destructive" leftIcon={<XCircle />} loading={pending === 'REFUSE'} disabled={!!pending} onClick={() => act('REFUSE')}>Refuser</Button>
                  <Button variant="success" leftIcon={<CheckCircle2 />} loading={pending === 'APPROUVE'} disabled={!!pending} onClick={() => act('APPROUVE')}>Approuver</Button>
                </>
              )}
              {!canAct && <Button variant="outline" onClick={() => onOpenChange(false)}>Fermer</Button>}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
