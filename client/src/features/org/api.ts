import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Employee, Paginated } from '@/lib/types';

export interface Department {
  id: number;
  name: string;
  code: string;
  description: string | null;
  managerEmployeeId: number | null;
  managerName: string | null;
  active: boolean;
  employeesCount: number;
}
export interface Position {
  id: number;
  title: string;
  departmentId: number | null;
  departmentName: string | null;
}
export interface DepartmentInput { name: string; code: string; description?: string | null; managerEmployeeId?: number | null }
export interface PositionInput { title: string; departmentId?: number | null }

export const orgKeys = {
  departments: ['departments', 'list'] as const,
  positions: ['positions', 'list'] as const,
  employeeOptions: ['employees', 'options'] as const,
};

export function useDepartments() {
  return useQuery({
    queryKey: orgKeys.departments,
    queryFn: ({ signal }) => api.get<Department[]>('/departments', undefined, signal),
    staleTime: 5 * 60_000,
  });
}

export function usePositions() {
  return useQuery({
    queryKey: orgKeys.positions,
    queryFn: ({ signal }) => api.get<Position[]>('/positions', undefined, signal),
    staleTime: 5 * 60_000,
  });
}

/** Liste compacte des employés (sélecteurs). Le serveur restreint au périmètre de l'utilisateur. */
export function useEmployeeOptions(enabled = true) {
  return useQuery({
    queryKey: orgKeys.employeeOptions,
    queryFn: ({ signal }) => api.get<Paginated<Employee>>('/employees', { pageSize: 500 }, signal),
    select: (d) => d.items,
    staleTime: 5 * 60_000,
    enabled,
  });
}

export function useDepartmentOptions() {
  const q = useDepartments();
  return (q.data ?? []).filter((d) => d.active).map((d) => ({ value: String(d.id), label: d.name }));
}

export function useEmployeeSelectOptions() {
  const q = useEmployeeOptions();
  return (q.data ?? []).map((e) => ({ value: String(e.id), label: `${e.fullName} · ${e.matricule}` }));
}

export function useSaveDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id?: number; data: DepartmentInput }) =>
      id ? api.put<Department>(`/departments/${id}`, data) : api.post<Department>('/departments', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['departments'] }); qc.invalidateQueries({ queryKey: ['employees'] }); },
  });
}

export function useDeactivateDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/departments/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['departments'] }),
    meta: { successMessage: 'Département désactivé.' },
  });
}

export function useReactivateDepartment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.put(`/departments/${id}`, { active: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['departments'] }),
  });
}

export function useSavePosition() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id?: number; data: PositionInput }) =>
      id ? api.put<Position>(`/positions/${id}`, data) : api.post<Position>('/positions', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['positions'] }),
  });
}
