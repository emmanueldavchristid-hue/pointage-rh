import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { authKeys } from '@/features/auth/api';

export interface CompanySettings {
  id?: number;
  name: string;
  legalName?: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  timezone: string;
  currency: string;
  openingTime: string | null;
  closingTime: string | null;
  logoPath?: string | null;
  logoUrl?: string | null;
}
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

export interface OvertimeRate { code: string; label: string; percent: number }
export interface SystemSettings {
  clocking: { allowedNetworks: string[]; enforceNetwork: boolean; maxAttemptsPerMinute: number; repeatedRefusalThreshold: number; dayCloseGraceMinutes?: number };
  security: { sessionHours: number; maxLoginAttempts: number; lockMinutes: number };
  retention: { auditDays: number; attendanceYears: number };
  backup: { enabled: boolean; cron: string; keep: number };
  overtime: { requireValidation: boolean; rates: OvertimeRate[] };
  anomalies: { maxWorkMinutes: number; offHoursMarginMin: number };
}
export type SystemSection = keyof SystemSettings;

export const settingsKeys = {
  all: ['settings'] as const,
  company: () => ['settings', 'company'] as const,
  system: () => ['settings', 'system'] as const,
};

export function useCompanySettings() {
  return useQuery({ queryKey: settingsKeys.company(), queryFn: ({ signal }) => api.get<CompanySettings>('/settings/company', undefined, signal) });
}
export function useUpdateCompanySettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CompanyInput) => api.put<CompanySettings>('/settings/company', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: settingsKeys.all }); qc.invalidateQueries({ queryKey: authKeys.me }); },
    meta: { successMessage: 'Informations de l\'entreprise enregistrées.' },
  });
}
export function useUploadLogo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => api.upload<CompanySettings>('/settings/company/logo', { file }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: settingsKeys.all }); qc.invalidateQueries({ queryKey: authKeys.me }); },
    meta: { successMessage: 'Logo mis à jour.' },
  });
}

export function useSystemSettings(enabled = true) {
  return useQuery({ queryKey: settingsKeys.system(), queryFn: ({ signal }) => api.get<SystemSettings>('/settings/system', undefined, signal), enabled });
}
/** PUT /settings/system avec uniquement la section modifiée. */
export function useUpdateSystemSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ section, value }: { section: SystemSection; value: SystemSettings[SystemSection] }) =>
      api.put<SystemSettings>('/settings/system', { [section]: value }),
    onSuccess: (data) => {
      if (data && typeof data === 'object' && 'clocking' in data) qc.setQueryData(settingsKeys.system(), data);
      qc.invalidateQueries({ queryKey: settingsKeys.system() });
    },
    meta: { successMessage: 'Paramètres enregistrés.' },
  });
}
