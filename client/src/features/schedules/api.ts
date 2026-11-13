import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface ScheduleVersion {
  id: number;
  scheduleId: number;
  effectiveFrom: string;
  startTime: string;
  endTime: string;
  breakStart: string | null;
  breakEnd: string | null;
  workDays: number[];
  dailyMinutes: number;
  lateToleranceMin: number;
  earlyLeaveToleranceMin: number;
  overtimeThresholdMin: number;
  breakTracking: boolean;
  maxBreaks: number;
  arrivalWindowBeforeMin: number;
  note?: string | null;
  createdAt?: string;
}

export type ScheduleVersionInput = Omit<ScheduleVersion, 'id' | 'scheduleId' | 'createdAt' | 'note'>;

export interface Schedule {
  id: number;
  name: string;
  description: string | null;
  isDefault: boolean;
  active: boolean;
  currentVersion: ScheduleVersion | null;
  upcomingVersion?: ScheduleVersion | null;
  versions: ScheduleVersion[];
  assignmentsCount: number;
}

export interface ScheduleAssignment {
  id: number;
  scheduleId: number;
  employeeId: number | null;
  departmentId: number | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  scheduleName?: string;
  employeeName?: string | null;
  departmentName?: string | null;
  target?: 'EMPLOYE' | 'DEPARTEMENT';
}

export interface ResolvedSchedule {
  source: 'EMPLOYE' | 'DEPARTEMENT' | 'DEFAUT';
  schedule: { id: number; name: string } | null;
  version: ScheduleVersion | null;
}

export interface Holiday {
  id: number;
  date: string;
  label: string;
  recurring: boolean;
}

export const scheduleKeys = {
  all: ['schedules'] as const,
  list: () => ['schedules', 'list'] as const,
  assignments: (f: { employeeId?: string; departmentId?: string } = {}) => ['schedules', 'assignments', f] as const,
  resolve: (employeeId: number, date: string) => ['schedules', 'resolve', { employeeId, date }] as const,
};
export const holidayKeys = { all: ['holidays'] as const, list: () => ['holidays', 'list'] as const };

export function useSchedules() {
  return useQuery({ queryKey: scheduleKeys.list(), queryFn: ({ signal }) => api.get<Schedule[]>('/schedules', undefined, signal) });
}

export function useCreateSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; description?: string; version: ScheduleVersionInput }) => api.post<Schedule>('/schedules', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: scheduleKeys.all }),
    meta: { successMessage: 'Horaire créé.' },
  });
}

export function useUpdateSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number; name?: string; description?: string | null; active?: boolean; isDefault?: boolean }) =>
      api.put<Schedule>(`/schedules/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: scheduleKeys.all }),
    meta: { successMessage: 'Horaire mis à jour.' },
  });
}

export function useCreateScheduleVersion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ scheduleId, ...body }: ScheduleVersionInput & { scheduleId: number }) => api.post(`/schedules/${scheduleId}/versions`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: scheduleKeys.all }),
    meta: { successMessage: 'Nouvelle version enregistrée.' },
  });
}

export function useAssignments(f: { employeeId?: string; departmentId?: string } = {}) {
  return useQuery({
    queryKey: scheduleKeys.assignments(f),
    queryFn: ({ signal }) => api.get<ScheduleAssignment[]>('/schedules/assignments', f, signal),
  });
}

export function useCreateAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { scheduleId: number; employeeIds?: number[]; departmentId?: number; effectiveFrom: string; effectiveTo?: string }) =>
      api.post('/schedules/assignments', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: scheduleKeys.all }),
    meta: { successMessage: 'Affectation enregistrée.' },
  });
}

export function useCloseAssignment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/schedules/assignments/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: scheduleKeys.all }),
    meta: { successMessage: 'Affectation clôturée.' },
  });
}

export function useResolveSchedule(employeeId: number | null, date: string) {
  return useQuery({
    queryKey: scheduleKeys.resolve(employeeId ?? 0, date),
    queryFn: ({ signal }) => api.get<ResolvedSchedule>('/schedules/resolve', { employeeId: employeeId ?? undefined, date }, signal),
    enabled: !!employeeId && /^\d{4}-\d{2}-\d{2}$/.test(date),
  });
}

export function useHolidays() {
  return useQuery({ queryKey: holidayKeys.list(), queryFn: ({ signal }) => api.get<Holiday[]>('/holidays', undefined, signal) });
}

export function useCreateHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { date: string; label: string; recurring: boolean }) => api.post<Holiday>('/holidays', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: holidayKeys.all }),
    meta: { successMessage: 'Jour férié ajouté.' },
  });
}

export function useDeleteHoliday() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/holidays/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: holidayKeys.all }),
    meta: { successMessage: 'Jour férié supprimé.' },
  });
}

// ---- Calculs ---------------------------------------------------------------

export const toMinutes = (hhmm?: string | null) => {
  if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return null;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** true si l'horaire traverse minuit (fin ≤ début). */
export const isNightSchedule = (start?: string | null, end?: string | null) => {
  const s = toMinutes(start);
  const e = toMinutes(end);
  return s !== null && e !== null && e <= s;
};

/** Durée théorique = amplitude − pause (gère le passage de minuit). */
export function computeDailyMinutes(start?: string | null, end?: string | null, bStart?: string | null, bEnd?: string | null): number | null {
  const s = toMinutes(start);
  let e = toMinutes(end);
  if (s === null || e === null) return null;
  if (e <= s) e += 1440;
  let total = e - s;
  const bs = toMinutes(bStart);
  let be = toMinutes(bEnd);
  if (bs !== null && be !== null) {
    if (be <= bs) be += 1440;
    total -= be - bs;
  }
  return Math.max(0, total);
}
