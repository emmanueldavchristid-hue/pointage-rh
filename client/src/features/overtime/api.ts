import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Paginated } from '@/lib/types';

export interface OvertimeRecord {
  id: number;
  attendanceId: number;
  employeeId: number;
  employee: { fullName: string; matricule: string; departmentName: string | null; photoUrl?: string | null };
  workDate: string;
  potentialMinutes: number;
  validatedMinutes: number | null;
  status: 'EN_ATTENTE' | 'VALIDE' | 'REFUSE' | string;
  rateCode: string | null;
  comment: string | null;
  decidedAt: string | null;
  arrivalAt: string | null;
  departureAt: string | null;
  workedMinutes: number;
  expectedMinutes: number;
}

export interface OvertimeFilters { status?: string; from?: string; to?: string; departmentId?: string; page?: number; pageSize?: number }

export const overtimeKeys = {
  all: ['overtime'] as const,
  list: (f: OvertimeFilters) => ['overtime', 'list', f] as const,
};

export function useOvertime(f: OvertimeFilters) {
  return useQuery({
    queryKey: overtimeKeys.list(f),
    queryFn: ({ signal }) => api.get<Paginated<OvertimeRecord>>('/overtime', { ...f }, signal),
    placeholderData: keepPreviousData,
  });
}

export function useDecideOvertime() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number; status: 'VALIDE' | 'REFUSE'; validatedMinutes?: number; rateCode?: string; comment?: string }) =>
      api.post(`/overtime/${id}/decide`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: overtimeKeys.all }); qc.invalidateQueries({ queryKey: ['dashboard'] }); },
    meta: { silent: true },
  });
}

export const OVERTIME_STATUS: Record<string, { label: string; variant: 'warning' | 'success' | 'danger' | 'neutral' }> = {
  EN_ATTENTE: { label: 'À valider', variant: 'warning' },
  VALIDE: { label: 'Validées', variant: 'success' },
  REFUSE: { label: 'Refusées', variant: 'danger' },
};
