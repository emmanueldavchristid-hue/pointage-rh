import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Attendance, DayStatus, Employee, Paginated, Severity, AnomalyStatus } from '@/lib/types';

export interface AttendanceEvent {
  id: string | number;
  attendanceId: number | null;
  employeeId: number;
  workDate: string;
  type: string;
  serverTime: string;
  source: string;
  result: 'ACCEPTE' | 'REFUSE' | string;
  reasonCode: string | null;
  reasonMessage: string | null;
  ip: string | null;
  deviceId: string | null;
  userAgent?: string | null;
  location: string | null;
  supersededBy: string | number | null;
  createdBy?: number | null;
  meta?: Record<string, unknown> | null;
  employee?: { fullName: string; matricule: string; departmentName: string | null };
}

export interface AttendanceCorrection {
  id: number;
  attendanceId: number;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  reason: string;
  adminUserId: number;
  adminLogin?: string;
  createdAt: string;
}

export interface AttendanceBreak { id?: number; startAt: string; endAt: string | null; minutes?: number | null }

export interface LinkedAnomaly {
  id: number; type: string; severity: Severity; status: AnomalyStatus; message: string; detectedAt: string; resolutionNote: string | null;
}

export interface ScheduleVersion {
  id: number; effectiveFrom: string; startTime: string; endTime: string; breakStart: string | null; breakEnd: string | null;
  workDays: number[]; dailyMinutes: number; lateToleranceMin: number; earlyLeaveToleranceMin: number; overtimeThresholdMin: number;
  breakTracking: boolean; maxBreaks: number;
}

export interface AttendanceDetail extends Attendance {
  breakCount?: number;
  dayStatusOverride?: DayStatus | null;
  events: AttendanceEvent[];
  breaks: AttendanceBreak[];
  corrections: AttendanceCorrection[];
  anomalies: LinkedAnomaly[];
  overtime: { id: number; potentialMinutes: number; validatedMinutes: number | null; status: string } | null;
  scheduleVersion: ScheduleVersion | null;
}

type LiveBrief = { employeeId: number; fullName: string; matricule: string; departmentName: string | null; photoUrl: string | null };
export interface LiveResponse {
  date: string;
  holiday?: string | null;
  present: Attendance[];
  notArrived: (LiveBrief & { expectedStart?: string | null })[];
  late: Attendance[];
  earlyLeave: Attendance[];
  incomplete: Attendance[];
  onBreak: Attendance[];
  onLeave: (LiveBrief & { leave?: string; category?: string })[];
  absent?: (LiveBrief & { attendanceId?: number; dayStatus?: DayStatus })[];
  departed?: Attendance[];
  notScheduled?: (LiveBrief & { reason?: string })[];
  counts: Record<string, number>;
  generatedAt?: string;
}

export interface AttendanceFilters {
  date?: string; from?: string; to?: string; departmentId?: string; employeeId?: string; state?: string; dayStatus?: string;
  corrected?: string; page?: number; pageSize?: number;
}
export interface EventFilters { employeeId?: string; from?: string; to?: string; result?: string; page?: number; pageSize?: number }

export const attendanceKeys = {
  all: ['attendance'] as const,
  list: (f: AttendanceFilters) => ['attendance', 'list', f] as const,
  detail: (id: number) => ['attendance', 'detail', id] as const,
  live: (f: { date?: string; departmentId?: string }) => ['attendance', 'live', f] as const,
  events: (f: EventFilters) => ['attendance', 'events', f] as const,
  employee: (id: number, from: string, to: string) => ['attendance', 'employee', id, from, to] as const,
};

export function useAttendanceList(f: AttendanceFilters) {
  return useQuery({
    queryKey: attendanceKeys.list(f),
    queryFn: ({ signal }) => api.get<Paginated<Attendance>>('/attendance', { ...f }, signal),
    placeholderData: keepPreviousData,
  });
}

export function useAttendanceDetail(id: number | null) {
  return useQuery({
    queryKey: attendanceKeys.detail(id ?? 0),
    queryFn: ({ signal }) => api.get<AttendanceDetail>(`/attendance/${id}`, undefined, signal),
    enabled: !!id,
  });
}

export function useLive(f: { date?: string; departmentId?: string }) {
  return useQuery({
    queryKey: attendanceKeys.live(f),
    queryFn: ({ signal }) => api.get<LiveResponse>('/attendance/live', { ...f }, signal),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    placeholderData: keepPreviousData,
  });
}

/** Paginé selon le contrat ; tolère un tableau brut. */
export function useEvents(f: EventFilters, enabled = true) {
  return useQuery({
    queryKey: attendanceKeys.events(f),
    queryFn: async ({ signal }) => {
      const r = await api.get<Paginated<AttendanceEvent> | AttendanceEvent[]>('/attendance/events', { ...f }, signal);
      return Array.isArray(r) ? { items: r, total: r.length, page: 1, pageSize: r.length } : r;
    },
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useEmployeeAttendance(id: number, from: string, to: string) {
  return useQuery({
    queryKey: attendanceKeys.employee(id, from, to),
    queryFn: async ({ signal }) => {
      const r = await api.get<Attendance[] | Paginated<Attendance>>(`/employees/${id}/attendance`, { from, to }, signal);
      return Array.isArray(r) ? r : r.items;
    },
  });
}

export interface CorrectionInput { arrivalAt?: string | null; departureAt?: string | null; dayStatus?: DayStatus | null; reason: string }

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  for (const k of ['attendance', 'anomalies', 'absences', 'dashboard', 'overtime']) qc.invalidateQueries({ queryKey: [k] });
}

export function useCorrectAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: CorrectionInput }) => api.post<AttendanceDetail>(`/attendance/${id}/correct`, data),
    onSuccess: () => invalidateAll(qc),
    meta: { successMessage: 'Correction enregistrée et tracée.' },
  });
}

export function useExceptionalAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { employeeId: number; workDate: string; arrivalAt?: string | null; departureAt?: string | null; reason: string }) =>
      api.post<AttendanceDetail>('/attendance/exceptional', data),
    onSuccess: () => invalidateAll(qc),
    meta: { successMessage: 'Pointage exceptionnel enregistré.' },
  });
}

export type { Employee };
