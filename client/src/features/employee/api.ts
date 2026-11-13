import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Attendance, Paginated } from '@/lib/types';
import type { CalendarDay, Justification, LeaveRequest, LeaveType, MeSummary, QrCodeResponse } from './types';

export const meKeys = {
  all: ['me'] as const,
  summary: (month: string) => ['me', 'summary', month] as const,
  attendance: (from: string, to: string) => ['me', 'attendance', { from, to }] as const,
  calendar: (month: string) => ['me', 'calendar', month] as const,
  qrcode: ['me', 'qrcode'] as const,
};
export const leaveKeys = {
  all: ['leaves'] as const,
  mine: ['leaves', 'list', { scope: 'mine' }] as const,
  types: ['leave-types'] as const,
};
export const justificationKeys = {
  all: ['justifications'] as const,
  mine: ['justifications', 'list', { scope: 'mine' }] as const,
};

/** Liste renvoyée en tableau brut ou paginée : on normalise. */
export function asList<T>(r: T[] | Paginated<T> | { items?: T[] } | null | undefined): T[] {
  if (!r) return [];
  if (Array.isArray(r)) return r;
  return r.items ?? [];
}

export function useMySummary(month: string) {
  return useQuery({
    queryKey: meKeys.summary(month),
    queryFn: ({ signal }) => api.get<MeSummary>('/me/summary', { month }, signal),
  });
}

export function useMyAttendance(from: string, to: string) {
  return useQuery({
    queryKey: meKeys.attendance(from, to),
    queryFn: async ({ signal }) =>
      asList(await api.get<Attendance[] | Paginated<Attendance>>('/me/attendance', { from, to }, signal)),
  });
}

export function useMyCalendar(month: string) {
  return useQuery({
    queryKey: meKeys.calendar(month),
    queryFn: async ({ signal }) => asList(await api.get<CalendarDay[] | { items: CalendarDay[] }>('/me/calendar', { month }, signal)),
  });
}

export function useMyQrCode() {
  return useQuery({
    queryKey: meKeys.qrcode,
    queryFn: ({ signal }) => api.get<QrCodeResponse>('/me/qrcode', undefined, signal),
    staleTime: 5 * 60_000,
  });
}

// ---- Congés & permissions ---------------------------------------------------
export function useLeaveTypes() {
  return useQuery({
    queryKey: leaveKeys.types,
    queryFn: async ({ signal }) => asList(await api.get<LeaveType[] | Paginated<LeaveType>>('/leave-types', undefined, signal)),
    staleTime: 5 * 60_000,
  });
}

export function useMyLeaves() {
  return useQuery({
    queryKey: leaveKeys.mine,
    queryFn: ({ signal }) => api.get<Paginated<LeaveRequest>>('/leaves', { scope: 'mine', pageSize: 100 }, signal),
  });
}

export interface LeaveInput {
  leaveTypeId: number;
  startDate: string;
  endDate: string;
  comment?: string;
  draft: boolean;
  file?: File | null;
}

export function useCreateLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ file, ...input }: LeaveInput) =>
      file
        ? api.upload<LeaveRequest>('/leaves', {
            leaveTypeId: input.leaveTypeId,
            startDate: input.startDate,
            endDate: input.endDate,
            comment: input.comment || undefined,
            draft: input.draft,
            file,
          })
        : api.post<LeaveRequest>('/leaves', { ...input, comment: input.comment || undefined }),
    onSuccess: () => qc.invalidateQueries({ queryKey: leaveKeys.all }),
  });
}

export function useSubmitLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post(`/leaves/${id}/submit`),
    meta: { successMessage: 'Demande envoyée pour validation.' },
    onSuccess: () => qc.invalidateQueries({ queryKey: leaveKeys.all }),
  });
}

export function useCancelLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post(`/leaves/${id}/cancel`),
    meta: { successMessage: 'Demande annulée.' },
    onSuccess: () => qc.invalidateQueries({ queryKey: leaveKeys.all }),
  });
}

// ---- Justificatifs ----------------------------------------------------------
export function useMyJustifications() {
  return useQuery({
    queryKey: justificationKeys.mine,
    queryFn: async ({ signal }) =>
      asList(await api.get<Justification[] | Paginated<Justification>>('/justifications', { scope: 'mine' }, signal)),
  });
}

export interface JustificationInput { workDate: string; reason: string; file?: File | null }

export function useCreateJustification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: JustificationInput) =>
      api.upload<Justification>('/justifications', { workDate: input.workDate, reason: input.reason, file: input.file ?? undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: justificationKeys.all });
      qc.invalidateQueries({ queryKey: meKeys.all });
    },
  });
}
