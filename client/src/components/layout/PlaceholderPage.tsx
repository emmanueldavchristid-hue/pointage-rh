import { Construction, type LucideIcon } from 'lucide-react';
import { Card, EmptyState, PageHeader } from '@/components/ui';

/** Page provisoire (à remplacer par l'implémentation métier). */
export function PlaceholderPage({ title, description, icon = Construction, compact }: { title: string; description?: string; icon?: LucideIcon; compact?: boolean }) {
  return (
    <div>
      <PageHeader title={title} description={description} className={compact ? 'mb-4 [&_h1]:text-xl' : undefined} />
      <Card>
        <EmptyState icon={icon} title="En cours de construction" description="Cette section sera bientôt disponible." compact={compact} />
      </Card>
    </div>
  );
}
