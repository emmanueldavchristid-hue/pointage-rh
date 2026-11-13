import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Attendance, Paginated } from '@/lib/types';

export interface AbsenceJustification { id: number; fileName: string | null; status: string; reason?: string | null; hasFile?: boolean }
export type Absence = Attendance & { justification?: AbsenceJustification | null };

export interface AbsenceFilters { from?: string; to?: string; departmentId?: string; employeeId?: string; dayStatus?: string; page?: number; pageSize?: number }

export const absenceKeys = {
  all: ['absences'] as const,
  list: (f: AbsenceFilters) => ['absences', 'list', f] as const,
};

/** GET /absences — paginé ou tableau selon l'implémentation serveur. */
export function useAbsences(f: AbsenceFilters, enabled = true) {
  return useQuery({
    queryKey: absenceKeys.list(f),
    queryFn: async ({ signal }) => {
      const r = await api.get<Paginated<Absence> | Absence[]>('/absences', { ...f }, signal);
      return Array.isArray(r) ? { items: r, total: r.length, page: 1, pageSize: r.length } : r;
    },
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useReviewJustification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status, comment }: { id: number; status: 'VALIDE' | 'REJETE'; comment?: string }) =>
      api.post(`/justifications/${id}/review`, { status, comment: comment || undefined }),
    onSuccess: () => {
      for (const k of ['absences', 'justifications', 'attendance', 'dashboard']) qc.invalidateQueries({ queryKey: [k] });
    },
  });
}

export interface LeaveRow {
  id: number;
  leaveType: { label: string; color?: string | null; code?: string };
  startDate: string; endDate: string; workingDays: number; status: string; comment: string | null; createdAt: string;
  employeeId: number;
}

export function useEmployeeLeaves(employeeId: number) {
  return useQuery({
    queryKey: ['leaves', 'list', { scope: 'all', employeeId }],
    queryFn: async ({ signal }) => {
      const r = await api.get<Paginated<LeaveRow> | LeaveRow[]>('/leaves', { scope: 'all', employeeId, pageSize: 100 }, signal);
      const items = Array.isArray(r) ? r : r.items;
      // Filtre de sécurité si le serveur ignore employeeId.
      return items.filter((l) => l.employeeId === undefined || l.employeeId === employeeId);
    },
  });
}
