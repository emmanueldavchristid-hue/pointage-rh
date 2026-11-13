import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { ClockAction, ClockStatus } from '@/lib/types';

export const clockKeys = {
  all: ['clock'] as const,
  status: ['clock', 'status'] as const,
};

export function useClockStatus() {
  return useQuery({
    queryKey: clockKeys.status,
    queryFn: ({ signal }) => api.get<ClockStatus>('/clock/status', undefined, signal),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
  });
}

export interface ScanInput {
  action: ClockAction;
  qrPayload: string;
  idempotencyKey: string;
  clientTime?: string;
}

export interface ScanResponse {
  ok: true;
  event: { type: ClockAction; serverTime: string };
  status: ClockStatus;
  message: string;
  /** Avertissements éventuels (retard, jour non travaillé…). */
  warnings?: string[];
}

/** POST /clock/scan — idempotent grâce à idempotencyKey (réutilisée lors d'un renvoi). */
export const postScan = (input: ScanInput) => api.post<ScanResponse>('/clock/scan', input);
