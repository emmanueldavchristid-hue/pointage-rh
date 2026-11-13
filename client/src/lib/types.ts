// Types partagés issus du contrat docs/API.md

export type Role = 'SUPER_ADMIN' | 'HR_ADMIN' | 'MANAGER' | 'EMPLOYEE';

export type ClockState =
  | 'NON_POINTE' | 'PRESENT' | 'EN_PAUSE' | 'DE_RETOUR_DE_PAUSE' | 'PARTI' | 'POINTAGE_INCOMPLET' | 'ANOMALIE';

export type DayStatus =
  | 'EN_COURS' | 'PRESENT' | 'RETARD' | 'ABSENCE_NON_JUSTIFIEE' | 'ABSENCE_JUSTIFIEE' | 'CONGE'
  | 'PERMISSION' | 'MISSION' | 'FERIE' | 'NON_TRAVAILLE' | 'INCOMPLET';

export type LeaveStatus = 'BROUILLON' | 'EN_ATTENTE' | 'APPROUVE' | 'REFUSE' | 'ANNULE';
export type AnomalyStatus = 'OUVERTE' | 'EN_COURS' | 'RESOLUE' | 'IGNOREE';
export type Severity = 'FAIBLE' | 'MOYENNE' | 'ELEVEE' | 'CRITIQUE';
export type ClockAction = 'ARRIVEE' | 'DEPART' | 'PAUSE_DEBUT' | 'PAUSE_FIN';

export interface LinkedEmployee {
  id: number;
  matricule: string;
  firstNames: string;
  lastName: string;
  photoUrl: string | null;
  departmentId: number | null;
  departmentName: string | null;
  positionTitle: string | null;
}

export interface User {
  id: number;
  login: string;
  role: Role;
  mustChangePassword: boolean;
  employee: LinkedEmployee | null;
}

export interface Company {
  id: number;
  name: string;
  logoUrl: string | null;
  timezone: string;
  currency: string;
  setupCompleted: boolean;
  clockingEnabled: boolean;
}

export interface MeResponse {
  user: User;
  company: Company;
  permissions: string[];
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export interface Employee {
  id: number;
  matricule: string;
  lastName: string;
  firstNames: string;
  fullName: string;
  photoUrl: string | null;
  email: string | null;
  phone: string | null;
  gender: string | null;
  birthDate: string | null;
  departmentId: number | null;
  departmentName: string | null;
  positionId: number | null;
  positionTitle: string | null;
  hireDate: string | null;
  contractType: string;
  status: string;
  managerId: number | null;
  managerName: string | null;
  role: Role;
  createdAt: string;
}

export interface Attendance {
  id: number;
  employeeId: number;
  employee: { fullName: string; matricule: string; departmentName: string | null; photoUrl: string | null };
  workDate: string;
  state: ClockState;
  dayStatus: DayStatus;
  arrivalAt: string | null;
  departureAt: string | null;
  expectedMinutes: number;
  lateRawMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  presenceMinutes: number;
  breakMinutes: number;
  workedMinutes: number;
  normalMinutes: number;
  overtimePotentialMinutes: number;
  corrected: boolean;
  isClosed: boolean;
}

export interface ClockStatus {
  workDate: string;
  state: ClockState;
  dayStatus: DayStatus;
  arrivalAt: string | null;
  departureAt: string | null;
  breaks: { startAt: string; endAt: string | null }[];
  breakTracking: boolean;
  maxBreaks: number;
  allowedActions: ClockAction[];
  schedule: {
    name: string; startTime: string; endTime: string;
    breakStart: string | null; breakEnd: string | null; lateToleranceMin: number;
  } | null;
  isWorkingDay: boolean;
  holiday: string | null;
  leave: { type: string; label: string } | null;
  lateMinutes: number;
  workedMinutes: number;
  clockingEnabled: boolean;
}

/** Forme non spécifiée dans API.md : champs tolérants. */
export interface AppNotification {
  id: number;
  title?: string;
  message?: string;
  body?: string;
  type?: string;
  link?: string | null;
  url?: string | null;
  read?: boolean;
  readAt?: string | null;
  createdAt: string;
}

export interface NotificationsResponse {
  items: AppNotification[];
  unreadCount: number;
}
