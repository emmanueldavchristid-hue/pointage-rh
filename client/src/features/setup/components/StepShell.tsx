import { ArrowLeft } from 'lucide-react';
import { Button, Card } from '@/components/ui';

export function StepShell({ title, description, children, footer }: { title: string; description?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {description && <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p>}
      </div>
      <div className="px-5 py-5 sm:px-6">{children}</div>
      {footer && <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">{footer}</div>}
    </Card>
  );
}

export function BackButton({ onClick }: { onClick?: () => void }) {
  if (!onClick) return <span />;
  return (
    <Button variant="ghost" size="lg" leftIcon={<ArrowLeft />} onClick={onClick}>
      Étape précédente
    </Button>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-slate-500">{children}</h3>;
}
