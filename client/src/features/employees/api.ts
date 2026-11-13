import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Employee, Paginated, Role } from '@/lib/types';
import type { ScheduleVersion } from '@/features/attendance/api';

export interface EmployeeDetail extends Employee {
  user?: { login: string; role: Role; active: boolean; lastLoginAt: string | null } | null;
  schedule?: { id?: number; name: string; source?: string; version: ScheduleVersion | number | null } | null;
}

export interface EmployeeInput {
  matricule: string; lastName: string; firstNames: string; email?: string | null; phone?: string | null; gender?: 'M' | 'F' | null;
  birthDate?: string | null; departmentId?: number | null; positionId?: number | null; hireDate?: string | null; contractType: string;
  managerId?: number | null; role?: Role;
}

export interface EmployeeFilters { q?: string; departmentId?: string; status?: string; page?: number; pageSize?: number }
export interface ImportResult {
  created: number; skipped: number; errors: { row: number; message: string }[]; initialPasswords?: { matricule: string; password: string }[];
}

export const employeeKeys = {
  all: ['employees'] as const,
  list: (f: EmployeeFilters) => ['employees', 'list', f] as const,
  detail: (id: number) => ['employees', 'detail', id] as const,
  qrcode: (id: number) => ['employees', 'qrcode', id] as const,
};

export function useEmployees(f: EmployeeFilters) {
  return useQuery({
    queryKey: employeeKeys.list(f),
    queryFn: ({ signal }) => api.get<Paginated<Employee>>('/employees', { ...f }, signal),
    placeholderData: keepPreviousData,
  });
}

export function useEmployee(id: number) {
  return useQuery({
    queryKey: employeeKeys.detail(id),
    queryFn: ({ signal }) => api.get<EmployeeDetail>(`/employees/${id}`, undefined, signal),
    enabled: id > 0,
  });
}

export function useEmployeeQr(id: number, enabled: boolean) {
  return useQuery({
    queryKey: employeeKeys.qrcode(id),
    queryFn: ({ signal }) => api.get<{ token: string; png: string }>(`/employees/${id}/qrcode`, undefined, signal),
    enabled,
  });
}

export interface SaveResult { employee: Employee; initialPassword?: string; login?: string }

export function useSaveEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id?: number; data: EmployeeInput }): Promise<SaveResult> => {
      if (id) return { employee: await api.put<Employee>(`/employees/${id}`, data) };
      return api.post<SaveResult>('/employees', data);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['employees'] }); qc.invalidateQueries({ queryKey: ['departments'] }); },
  });
}

export function useToggleEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, active, reason }: { id: number; active: boolean; reason: string }) =>
      api.post(`/employees/${id}/${active ? 'reactivate' : 'deactivate'}`, { reason }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['employees'] });
      qc.invalidateQueries({ queryKey: ['departments'] });
      void v;
    },
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (id: number) => api.post<{ temporaryPassword: string; login?: string }>(`/employees/${id}/reset-password`),
  });
}

export function useUploadPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, file }: { id: number; file: File }) => api.upload<{ photoUrl: string }>(`/employees/${id}/photo`, { file }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employees'] }),
    meta: { successMessage: 'Photo mise à jour.' },
  });
}

export function useRegenerateQr() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post<{ token: string; png: string }>(`/employees/${id}/qrcode/regenerate`),
    onSuccess: (_d, id) => qc.invalidateQueries({ queryKey: employeeKeys.qrcode(id) }),
    meta: { successMessage: 'Nouveau QR Code généré. L’ancien est révoqué.' },
  });
}

export function useImportEmployees() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => api.upload<ImportResult>('/employees/import', { file }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['employees'] }),
  });
}

/** URL des badges PDF (ouverture dans un nouvel onglet ; cookie de session inclus). */
export const badgesUrl = (ids: number[]) => `/api/employees/badges.pdf?ids=${ids.join(',')}`;
