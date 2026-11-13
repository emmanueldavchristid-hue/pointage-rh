import { ScanLine } from 'lucide-react';
import { assetUrl } from '@/lib/api';
import { cn } from '@/lib/utils';

/** Logo entreprise (si fourni par l'API) ou pictogramme par défaut. */
export function BrandMark({ logoUrl, name, className, inverted }: { logoUrl?: string | null; name?: string | null; className?: string; inverted?: boolean }) {
  if (logoUrl) {
    return (
      <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white ring-1 ring-slate-900/5', className)}>
        <img src={assetUrl(logoUrl)} alt={name ?? 'Logo'} className="h-full w-full object-contain p-1" />
      </span>
    );
  }
  return (
    <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', inverted ? 'bg-white/10 text-white ring-1 ring-white/15' : 'bg-ink text-white', className)}>
      <ScanLine className="h-[18px] w-[18px]" />
    </span>
  );
}
