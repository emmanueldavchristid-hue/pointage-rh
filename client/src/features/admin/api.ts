import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Paginated, Role } from '@/lib/types';

// ---- QR Codes de localisation ----------------------------------------------
export type LocationType = 'ENTREE' | 'SORTIE' | 'MIXTE';
export type LocationMode = 'DYNAMIQUE' | 'STATIQUE';
export interface QrLocation {
  id: number;
  code: string;
  label: string;
  type: LocationType;
  mode: LocationMode;
  rotationSeconds: number;
  active: boolean;
  displayUrl: string | null;
  secretVersion?: number;
}
export type LocationInput = Omit<QrLocation, 'id' | 'displayUrl' | 'secretVersion'>;

export const LOCATION_TYPE: Record<LocationType, string> = { ENTREE: 'Entrée', SORTIE: 'Sortie', MIXTE: 'Entrée et sortie' };
export const LOCATION_MODE: Record<LocationMode, string> = { DYNAMIQUE: 'Dynamique (borne)', STATIQUE: 'Statique (imprimé)' };

export const locationKeys = { all: ['locations'] as const, list: () => ['locations', 'list'] as const };

export function useLocations() {
  return useQuery({ queryKey: locationKeys.list(), queryFn: ({ signal }) => api.get<QrLocation[]>('/locations', undefined, signal) });
}
export function useSaveLocation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: LocationInput & { id?: number }) => (id ? api.put<QrLocation>(`/locations/${id}`, body) : api.post<QrLocation>('/locations', body)),
    onSuccess: () => qc.invalidateQueries({ queryKey: locationKeys.all }),
    meta: { successMessage: 'Emplacement enregistré.' },
  });
}
export function useRotateLocationSecret() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post<QrLocation>(`/locations/${id}/rotate-secret`),
    onSuccess: () => qc.invalidateQueries({ queryKey: locationKeys.all }),
    meta: { successMessage: 'Secret régénéré : les anciens QR codes et liens de borne sont invalidés.' },
  });
}

// ---- Utilisateurs admin ------------------------------------------------------
export interface AdminUser {
  id: number;
  login: string;
  role: Role;
  active: boolean;
  employeeId: number | null;
  employeeName: string | null;
  lastLoginAt: string | null;
  lockedUntil: string | null;
  createdAt: string;
}
export const userKeys = { all: ['users'] as const, list: (role: string) => ['users', 'list', { role }] as const };

export function useAdminUsers(role = '') {
  return useQuery({
    queryKey: userKeys.list(role),
    queryFn: ({ signal }) => api.get<AdminUser[] | Paginated<AdminUser>>('/users', { role }, signal),
    select: (d) => (Array.isArray(d) ? d : d.items),
  });
}
export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { login: string; password?: string; role: Role; employeeId?: number }) =>
      api.post<{ user?: AdminUser; initialPassword?: string; temporaryPassword?: string; password?: string } & Partial<AdminUser>>('/users', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.all }),
  });
}
export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: number; role?: Role; active?: boolean }) => api.put<AdminUser>(`/users/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.all }),
    meta: { successMessage: 'Compte mis à jour.' },
  });
}

// ---- Audit -------------------------------------------------------------------
export interface AuditLog {
  id: number;
  at: string;
  userId: number | null;
  userLogin: string | null;
  action: string;
  entity: string | null;
  entityId: string | number | null;
  before: unknown;
  after: unknown;
  reason: string | null;
  ip: string | null;
}
export interface AuditFilters { action?: string; userId?: string; from?: string; to?: string; page: number; pageSize: number }
export const auditKeys = { all: ['audit'] as const, list: (f: AuditFilters) => ['audit', 'list', f] as const };

export function useAuditLogs(f: AuditFilters) {
  return useQuery({
    queryKey: auditKeys.list(f),
    queryFn: ({ signal }) => api.get<Paginated<AuditLog>>('/audit', { ...f }, signal),
    placeholderData: keepPreviousData,
  });
}

// ---- Sauvegardes -------------------------------------------------------------
export interface Backup {
  id: number;
  fileName: string;
  sizeBytes: number;
  status: 'OK' | 'ERREUR';
  trigger: 'AUTO' | 'MANUEL';
  message: string | null;
  createdAt: string;
}
export const backupKeys = { all: ['backups'] as const, list: () => ['backups', 'list'] as const };

export function useBackups() {
  return useQuery({
    queryKey: backupKeys.list(),
    queryFn: ({ signal }) => api.get<Backup[] | Paginated<Backup>>('/backups', undefined, signal),
    select: (d) => (Array.isArray(d) ? d : d.items),
  });
}
export function useCreateBackup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<Backup>('/backups'),
    onSuccess: () => qc.invalidateQueries({ queryKey: backupKeys.all }),
    meta: { successMessage: 'Sauvegarde effectuée.' },
  });
}

export function formatBytes(n?: number | null): string {
  if (n === null || n === undefined || isNaN(n)) return '—';
  if (n < 1024) return `${n} o`;
  const units = ['Ko', 'Mo', 'Go'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(v)} ${units[i]}`;
}
