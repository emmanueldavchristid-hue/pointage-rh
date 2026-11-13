import type { DayStatus, ClockState, LeaveStatus } from '@/lib/types';

/** GET /me/summary?month=YYYY-MM */
export interface MeSummary {
  workedMinutes: number;
  expectedMinutes: number;
  lateCount: number;
  lateMinutes: number;
  absences: number;
  overtimePotential: number;
  overtimeValidated: number;
  leaveDaysTaken: number;
  daysPresent: number;
}

/** GET /me/calendar?month=YYYY-MM */
export interface CalendarDay {
  date: string;
  dayStatus: DayStatus | null;
  state: ClockState | null;
  holiday?: string | null;
  leave?: { type?: string; label?: string } | string | null;
}

export interface QrCodeResponse { token: string; png: string }

export interface LeaveType {
  id: number;
  code: string;
  label: string;
  category?: string;
  color?: string | null;
  requiresJustification?: boolean;
  active?: boolean;
}

export interface LeaveRequest {
  id: number;
  employeeId: number;
  employee?: { fullName: string; matricule: string; departmentName: string | null };
  leaveType: { id: number; code: string; label: string; category?: string; color?: string | null; requiresJustification?: boolean };
  startDate: string;
  endDate: string;
  workingDays: number;
  comment: string | null;
  status: LeaveStatus;
  managerDecision: string | null;
  managerComment: string | null;
  managerReviewedAt: string | null;
  hrComment: string | null;
  hrDecidedAt: string | null;
  justification: { id: number; fileName: string; status: string } | null;
  createdAt: string;
  canCancel: boolean;
}

export interface Justification {
  id: number;
  employeeId: number;
  workDate: string | null;
  attendanceId: number | null;
  leaveRequestId: number | null;
  reason: string;
  fileName: string | null;
  mimeType: string | null;
  hasFile: boolean;
  status: string;
  reviewComment: string | null;
  reviewedAt: string | null;
  createdAt: string;
}
