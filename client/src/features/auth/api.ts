import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import type { MeResponse, User } from '@/lib/types';

export const authKeys = {
  me: ['auth', 'me'] as const,
};

/** GET /auth/me — renvoie null si non connecté (401). Les autres erreurs (réseau…) remontent. */
export async function fetchMe(): Promise<MeResponse | null> {
  try {
    return await api.get<MeResponse>('/auth/me');
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return null;
    throw e;
  }
}

export interface LoginInput { login: string; password: string }

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LoginInput) => api.post<{ user: User }>('/auth/login', input),
    meta: { silent: true },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: authKeys.me });
    },
  });
}

export interface ChangePasswordInput { currentPassword: string; newPassword: string }

export function useChangePassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ChangePasswordInput) => api.post<{ ok: boolean }>('/auth/change-password', input),
    meta: { silent: true },
    onSuccess: () => qc.invalidateQueries({ queryKey: authKeys.me }),
  });
}
