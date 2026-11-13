import * as React from 'react';
import * as AvatarPrimitive from '@radix-ui/react-avatar';
import { assetUrl } from '@/lib/api';
import { cn, initials } from '@/lib/utils';

const sizes = { xs: 'h-6 w-6 text-[10px]', sm: 'h-8 w-8 text-xs', md: 'h-10 w-10 text-sm', lg: 'h-14 w-14 text-base', xl: 'h-20 w-20 text-xl' };

export interface AvatarProps extends React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root> {
  name?: string | null;
  src?: string | null;
  size?: keyof typeof sizes;
}

/** Avatar avec photo (chemin /uploads accepté) et initiales en repli. */
export const Avatar = React.forwardRef<React.ElementRef<typeof AvatarPrimitive.Root>, AvatarProps>(
  ({ className, name, src, size = 'md', ...props }, ref) => (
    <AvatarPrimitive.Root
      ref={ref}
      className={cn('relative inline-flex shrink-0 overflow-hidden rounded-full bg-brand-50 ring-1 ring-inset ring-slate-900/5', sizes[size], className)}
      {...props}
    >
      {src && <AvatarPrimitive.Image src={assetUrl(src)} alt={name ?? ''} className="h-full w-full object-cover" />}
      <AvatarPrimitive.Fallback delayMs={src ? 300 : 0} className="flex h-full w-full items-center justify-center font-semibold text-brand-700">
        {initials(name)}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  ),
);
Avatar.displayName = 'Avatar';
