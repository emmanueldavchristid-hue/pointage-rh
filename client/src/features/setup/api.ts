import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface ChecklistItem { key: string; label: string; done: boolean }
export interface SetupStatus { setupCompleted: boolean; clockingEnabled: boolean; checklist: ChecklistItem[] }

export interface CompanyInput {
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  timezone: string;
  currency: string;
  openingTime?: string;
  closingTime?: string;
}
export interface CompanySettings extends Partial<CompanyInput> {
  id: number;
  name: string;
  logoUrl?: string | null;
  logoPath?: string | null;
  timezone: string;
  currency: string;
}

export interface ScheduleVersionInput {
  effectiveFrom: string;
  startTime: string;
  endTime: string;
  breakStart?: string | null;
  breakEnd?: string | null;
  workDays: number[];
  dailyMinutes: number;
  lateToleranceMin: number;
  earlyLeaveToleranceMin: number;
  overtimeThresholdMin: number;
  breakTracking: boolean;
  maxBreaks: number;
  arrivalWindowBeforeMin: number;
}
export interface ScheduleSummary {
  id: number;
  name: string;
  isDefault: boolean;
  active: boolean;
  currentVersion: (ScheduleVersionInput & { id: number }) | null;
}

export type LocationType = 'ENTREE' | 'SORTIE';
export interface QrLocation {
  id: number;
  code: string;
  label: string;
  type: LocationType | string;
  mode: 'DYNAMIQUE' | 'STATIQUE' | string;
  rotationSeconds: number;
  active: boolean;
  displayUrl: string | null;
}
export type LocationInput = Omit<QrLocation, 'id' | 'displayUrl'>;

export interface SystemSettings {
  clocking: { allowedNetworks: string[]; enforceNetwork: boolean; maxAttemptsPerMinute: number; repeatedRefusalThreshold: number; [k: string]: unknown };
  [section: string]: unknown;
}

export const setupKeys = {
  all: ['setup'] as const,
  status: ['setup', 'status'] as const,
  company: ['settings', 'company'] as const,
  system: ['settings', 'system'] as const,
  schedules: ['schedules', 'list'] as const,
  locations: ['locations', 'list'] as const,
};

export function useSetupStatus() {
  return useQuery({ queryKey: setupKeys.status, queryFn: ({ signal }) => api.get<SetupStatus>('/setup/status', undefined, signal) });
}
export function useCompanySettings() {
  return useQuery({ queryKey: setupKeys.company, queryFn: ({ signal }) => api.get<CompanySettings>('/settings/company', undefined, signal) });
}
export function useSchedulesList() {
  return useQuery({ queryKey: setupKeys.schedules, queryFn: ({ signal }) => api.get<ScheduleSummary[]>('/schedules', undefined, signal) });
}
export function useLocationsList() {
  return useQuery({ queryKey: setupKeys.locations, queryFn: ({ signal }) => api.get<QrLocation[]>('/locations', undefined, signal) });
}
export function useSystemSettings() {
  return useQuery({ queryKey: setupKeys.system, queryFn: ({ signal }) => api.get<SystemSettings>('/settings/system', undefined, signal) });
}

function useInvalidateSetup() {
  const qc = useQueryClient();
  return (...extra: (readonly unknown[])[]) => {
    void qc.invalidateQueries({ queryKey: setupKeys.all });
    extra.forEach((k) => void qc.invalidateQueries({ queryKey: k }));
  };
}

export function useSaveCompany() {
  const inv = useInvalidateSetup();
  return useMutation({
    mutationFn: (body: CompanyInput) => api.put('/setup/company', body),
    meta: { silent: true },
    onSuccess: () => inv(['settings']),
  });
}
export function useUploadLogo() {
  const inv = useInvalidateSetup();
  return useMutation({
    mutationFn: (file: File) => api.upload('/settings/company/logo', { file }),
    meta: { successMessage: 'Logo mis à jour.' },
    onSuccess: () => inv(['settings']),
  });
}
export function useSaveSchedule() {
  const inv = useInvalidateSetup();
  return useMutation({
    mutationFn: (body: ScheduleVersionInput) => api.put('/setup/schedule', body),
    meta: { silent: true },
    onSuccess: () => inv(['schedules']),
  });
}
export function useCreateLocation() {
  const inv = useInvalidateSetup();
  return useMutation({
    mutationFn: (body: LocationInput) => api.post<QrLocation>('/locations', body),
    onSuccess: () => inv(['locations']),
  });
}
export function useSaveSystemSettings() {
  const inv = useInvalidateSetup();
  return useMutation({
    mutationFn: (body: SystemSettings) => api.put<SystemSettings>('/settings/system', body),
    meta: { silent: true },
    onSuccess: () => inv(['settings']),
  });
}
export function useActivateClocking() {
  const inv = useInvalidateSetup();
  return useMutation({
    mutationFn: () => api.post('/setup/activate'),
    meta: { silent: true },
    onSuccess: () => inv(),
  });
}
