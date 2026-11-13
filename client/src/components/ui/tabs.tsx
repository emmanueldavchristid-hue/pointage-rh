import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';

export const Tabs = TabsPrimitive.Root;

/** variant 'pills' (fond gris, défaut) ou 'underline' (onglets soulignés). */
type TabsVariant = 'pills' | 'underline';
const VariantCtx = React.createContext<TabsVariant>('pills');

export const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & { variant?: TabsVariant }
>(({ className, variant = 'pills', ...props }, ref) => (
  <VariantCtx.Provider value={variant}>
    <TabsPrimitive.List
      ref={ref}
      className={cn(
        variant === 'pills'
          ? 'inline-flex h-10 items-center gap-1 rounded-lg bg-slate-100 p-1 text-muted'
          : 'flex w-full items-center gap-6 border-b border-slate-200 text-muted',
        'max-w-full overflow-x-auto scrollbar-thin',
        className,
      )}
      {...props}
    />
  </VariantCtx.Provider>
));
TabsList.displayName = 'TabsList';

export const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => {
  const variant = React.useContext(VariantCtx);
  return (
    <TabsPrimitive.Trigger
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4',
        variant === 'pills'
          ? 'h-8 rounded-md px-3 hover:text-ink data-[state=active]:bg-white data-[state=active]:text-ink data-[state=active]:shadow-xs'
          : '-mb-px h-10 border-b-2 border-transparent px-0.5 hover:text-ink data-[state=active]:border-brand data-[state=active]:text-ink',
        className,
      )}
      {...props}
    />
  );
});
TabsTrigger.displayName = 'TabsTrigger';

export const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content ref={ref} className={cn('mt-4 focus-visible:outline-none', className)} {...props} />
));
TabsContent.displayName = 'TabsContent';
