import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { AnomalyStatus, Paginated, Severity } from '@/lib/types';

export interface Anomaly {
  id: number;
  employeeId: number;
  employee: { fullName: string; matricule: string; departmentName: string | null; photoUrl?: string | null };
  attendanceId: number | null;
  workDate: string;
  type: string;
  severity: Severity;
  status: AnomalyStatus;
  message: string;
  details: unknown;
  detectedAt: string;
  resolvedAt: string | null;
  resolutionNote: string | null;
}

export interface AnomalyFilters {
  status?: string; type?: string; severity?: string; from?: string; to?: string; departmentId?: string; employeeId?: string; page?: number; pageSize?: number;
}

export const anomalyKeys = {
  all: ['anomalies'] as const,
  list: (f: AnomalyFilters) => ['anomalies', 'list', f] as const,
};

export function useAnomalies(f: AnomalyFilters) {
  return useQuery({
    queryKey: anomalyKeys.list(f),
    queryFn: async ({ signal }) => {
      const r = await api.get<Paginated<Anomaly> | Anomaly[]>('/anomalies', { ...f }, signal);
      return Array.isArray(r) ? { items: r, total: r.length, page: 1, pageSize: r.length } : r;
    },
    placeholderData: keepPreviousData,
  });
}

export function useResolveAnomaly() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, note }: { id: number; status: 'RESOLUE' | 'IGNOREE' | 'EN_COURS'; note: string }) =>
      api.post<Anomaly>(`/anomalies/${id}/resolve`, { status, note }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['anomalies'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); },
    meta: { successMessage: 'Anomalie mise à jour.' },
  });
}

export function useRunDetection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (date?: string) => api.post<{ detected?: number; created?: number } & Record<string, unknown>>('/anomalies/run-detection', date ? { date } : {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['anomalies'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); },
  });
}
