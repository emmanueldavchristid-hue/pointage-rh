import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ApiError, errorMessage } from './api';

declare module '@tanstack/react-query' {
  interface Register {
    defaultError: ApiError;
    /** meta.silent = true → pas de toast automatique ; meta.successMessage → toast de succès. */
    mutationMeta: { silent?: boolean; successMessage?: string };
    queryMeta: { silent?: boolean };
  }
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      // Toast uniquement pour les rafraîchissements en arrière-plan échoués (données déjà affichées).
      if (query.meta?.silent) return;
      if (error instanceof ApiError && error.status === 401) return;
      if (query.state.data !== undefined) toast.error(errorMessage(error));
    },
  }),
  mutationCache: new MutationCache({
    onSuccess: (_d, _v, _c, mutation) => {
      const msg = mutation.meta?.successMessage;
      if (msg) toast.success(msg);
    },
    onError: (error, _v, _c, mutation) => {
      if (mutation.meta?.silent || mutation.options.onError) return;
      if (error instanceof ApiError && error.status === 401) return;
      toast.error(errorMessage(error));
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (count, error) => {
        if (error instanceof ApiError && error.status > 0 && error.status < 500) return false;
        return count < 1;
      },
    },
    mutations: { retry: false },
  },
});
