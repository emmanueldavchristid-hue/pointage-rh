import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { TooltipProvider } from '@/components/ui';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { queryClient } from '@/lib/queryClient';
import { AppRouter } from '@/routes/AppRouter';

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={250}>
        <BrowserRouter>
          <AuthProvider>
            <AppRouter />
          </AuthProvider>
        </BrowserRouter>
        <Toaster
          position="top-right"
          closeButton
          richColors
          offset={16}
          toastOptions={{
            classNames: {
              toast: 'font-sans rounded-xl border border-slate-200 shadow-pop text-sm',
              title: 'font-semibold',
              description: 'text-muted',
            },
          }}
        />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
