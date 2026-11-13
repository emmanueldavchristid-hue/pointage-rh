import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogPortal = DialogPrimitive.Portal;

export const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn('fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-[2px] data-[state=open]:animate-fade-in', className)}
    {...props}
  />
));
DialogOverlay.displayName = 'DialogOverlay';

const sizes = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

export interface DialogContentProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  size?: keyof typeof sizes;
  hideClose?: boolean;
}

export const DialogContent = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Content>, DialogContentProps>(
  ({ className, children, size = 'md', hideClose, ...props }, ref) => (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-pop focus:outline-none data-[state=open]:animate-zoom-in',
          sizes[size],
          className,
        )}
        {...props}
      >
        {children}
        {!hideClose && (
          <DialogPrimitive.Close className="absolute right-3 top-3 rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30">
            <X className="h-4 w-4" />
            <span className="sr-only">Fermer</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  ),
);
DialogContent.displayName = 'DialogContent';

export const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('space-y-1 px-6 pb-2 pt-6 pr-12', className)} {...props} />
);
export const DialogBody = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex-1 overflow-y-auto px-6 py-4 scrollbar-thin', className)} {...props} />
);
export const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-4 sm:flex-row sm:justify-end', className)} {...props} />
);

export const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn('text-lg font-semibold text-ink', className)} {...props} />
));
DialogTitle.displayName = 'DialogTitle';

export const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn('text-sm text-muted', className)} {...props} />
));
DialogDescription.displayName = 'DialogDescription';
