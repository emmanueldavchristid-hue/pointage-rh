import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { LeaveStatus, Paginated } from '@/lib/types';

export interface LeaveType {
  id: number;
  code: string;
  label: string;
  category: string;
  color: string | null;
  requiresJustification: boolean;
  active?: boolean;
  [k: string]: unknown;
}
export interface LeaveTypeInput { code: string; label: string; category: string; color: string; requiresJustification: boolean; active?: boolean }

export interface LeaveRequest {
  id: number;
  employeeId: number;
  employee: { fullName: string; matricule: string; departmentName: string | null; photoUrl?: string | null };
  leaveType: Pick<LeaveType, 'id' | 'code' | 'label' | 'category' | 'color' | 'requiresJustification'>;
  startDate: string;
  endDate: string;
  workingDays: number;
  comment: string | null;
  status: LeaveStatus;
  managerDecision: 'FAVORABLE' | 'DEFAVORABLE' | null;
  managerComment: string | null;
  managerReviewedAt: string | null;
  hrComment: string | null;
  hrDecidedAt: string | null;
  justification: { id: number; fileName: string; status: string } | null;
  createdAt: string;
  canManagerReview: boolean;
  canDecide: boolean;
  awaitingManager?: boolean;
  canCancel: boolean;
}

export interface LeaveCalendarItem {
  id: number;
  employeeId: number;
  fullName: string;
  departmentName: string | null;
  type: string;
  color: string | null;
  startDate: string;
  endDate: string;
  status: LeaveStatus;
}
export interface CalendarHoliday { date: string; label: string }

export interface LeaveFilters { scope: 'team' | 'all'; status?: string; from?: string; to?: string; page?: number; pageSize?: number }

export const leaveKeys = {
  all: ['leaves'] as const,
  list: (f: LeaveFilters) => ['leaves', 'list', f] as const,
  calendar: (f: { from: string; to: string; departmentId?: string }) => ['leaves', 'calendar', f] as const,
};
export const leaveTypeKeys = { all: ['leave-types'] as const, list: () => ['leave-types', 'list'] as const };

export function useLeaves(f: LeaveFilters, enabled = true) {
  return useQuery({
    queryKey: leaveKeys.list(f),
    queryFn: ({ signal }) => api.get<Paginated<LeaveRequest>>('/leaves', { ...f }, signal),
    placeholderData: keepPreviousData,
    enabled,
  });
}

/** Normalise la réponse du calendrier : tableau seul, ou objet avec jours fériés. */
export function useLeaveCalendar(f: { from: string; to: string; departmentId?: string }) {
  return useQuery({
    queryKey: leaveKeys.calendar(f),
    queryFn: ({ signal }) => api.get<unknown>('/leaves/calendar', f, signal),
    select: (d): { items: LeaveCalendarItem[]; holidays: CalendarHoliday[] | null } => {
      if (Array.isArray(d)) return { items: d as LeaveCalendarItem[], holidays: null };
      const o = (d ?? {}) as { items?: LeaveCalendarItem[]; leaves?: LeaveCalendarItem[]; holidays?: CalendarHoliday[] };
      return { items: o.items ?? o.leaves ?? [], holidays: o.holidays ?? null };
    },
    placeholderData: keepPreviousData,
  });
}

export function useManagerReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number; decision: 'FAVORABLE' | 'DEFAVORABLE'; comment?: string }) => api.post(`/leaves/${id}/manager-review`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: leaveKeys.all }); qc.invalidateQueries({ queryKey: ['dashboard'] }); },
    meta: { successMessage: 'Avis enregistré.' },
  });
}

export function useDecideLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number; decision: 'APPROUVE' | 'REFUSE'; comment?: string }) => api.post(`/leaves/${id}/decide`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: leaveKeys.all }); qc.invalidateQueries({ queryKey: ['dashboard'] }); },
    meta: { successMessage: 'Décision enregistrée.' },
  });
}

export function useLeaveTypes() {
  return useQuery({
    queryKey: leaveTypeKeys.list(),
    queryFn: ({ signal }) => api.get<LeaveType[] | Paginated<LeaveType>>('/leave-types', undefined, signal),
    select: (d) => (Array.isArray(d) ? d : d.items),
  });
}

export function useSaveLeaveType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: LeaveTypeInput & { id?: number }) => (id ? api.put<LeaveType>(`/leave-types/${id}`, body) : api.post<LeaveType>('/leave-types', body)),
    onSuccess: () => qc.invalidateQueries({ queryKey: leaveTypeKeys.all }),
    meta: { successMessage: 'Type de congé enregistré.' },
  });
}

export const LEAVE_CATEGORY: Record<string, string> = {
  CONGE: 'Congé',
  PERMISSION: 'Permission',
  MISSION: 'Mission',
  MALADIE: 'Maladie',
  ABSENCE: 'Absence autorisée',
};
