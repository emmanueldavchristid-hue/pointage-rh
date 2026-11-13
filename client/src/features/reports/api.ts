import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  AlarmClock, AlertTriangle, Building2, CalendarCheck, CalendarDays, CalendarOff, CalendarRange, Sun, Timer, UserRound, type LucideIcon,
} from 'lucide-react';
import { api } from '@/lib/api';

export type ReportType = 'daily' | 'weekly' | 'monthly' | 'employee' | 'late' | 'absences' | 'leaves' | 'overtime' | 'department' | 'anomalies';
export type ReportFormat = 'xlsx' | 'pdf' | 'csv';

export interface ReportParams { from?: string; to?: string; employeeId?: string; departmentId?: string; status?: string }

export interface ReportResult {
  title: string;
  period: { from: string; to: string };
  generatedAt: string;
  summary: { label: string; value: string | number | null }[];
  columns: { key: string; label: string }[];
  rows: Record<string, unknown>[];
}

export interface ReportDef {
  type: ReportType;
  title: string;
  description: string;
  icon: LucideIcon;
  /** Période par défaut proposée. */
  period: 'day' | 'week' | 'month';
  needsEmployee?: boolean;
  statuses?: { value: string; label: string }[];
}

export const REPORTS: ReportDef[] = [
  { type: 'daily', title: 'Rapport journalier', description: 'Présences, arrivées, départs et retards de chaque employé pour une journée.', icon: Sun, period: 'day' },
  { type: 'weekly', title: 'Rapport hebdomadaire', description: 'Synthèse par employé sur la semaine : jours présents, retards, heures travaillées.', icon: CalendarRange, period: 'week' },
  { type: 'monthly', title: 'Rapport mensuel', description: 'Récapitulatif mensuel par employé, base de la préparation de la paie.', icon: CalendarDays, period: 'month' },
  { type: 'employee', title: 'Relevé individuel', description: "Détail jour par jour d'un employé : pointages, pauses, retards et heures sup.", icon: UserRound, period: 'month', needsEmployee: true },
  { type: 'late', title: 'Retards', description: 'Liste des retards au-delà de la tolérance, avec cumul par employé.', icon: AlarmClock, period: 'month' },
  { type: 'absences', title: 'Absences', description: 'Absences justifiées et non justifiées, congés, permissions et missions.', icon: CalendarOff, period: 'month' },
  {
    type: 'leaves', title: 'Congés et permissions', description: 'Demandes de congés sur la période et leur statut de validation.', icon: CalendarCheck, period: 'month',
    statuses: [{ value: 'EN_ATTENTE', label: 'En attente' }, { value: 'APPROUVE', label: 'Approuvé' }, { value: 'REFUSE', label: 'Refusé' }, { value: 'ANNULE', label: 'Annulé' }],
  },
  {
    type: 'overtime', title: 'Heures supplémentaires', description: 'Heures sup. potentielles et validées, taux appliqués et décisions.', icon: Timer, period: 'month',
    statuses: [{ value: 'EN_ATTENTE', label: 'À valider' }, { value: 'VALIDE', label: 'Validées' }, { value: 'REFUSE', label: 'Refusées' }],
  },
  { type: 'department', title: 'Par département', description: 'Taux de présence, retards et absences comparés par département.', icon: Building2, period: 'month' },
  {
    type: 'anomalies', title: 'Anomalies', description: 'Anomalies de pointage détectées, gravité et traitement.', icon: AlertTriangle, period: 'month',
    statuses: [{ value: 'OUVERTE', label: 'Ouverte' }, { value: 'EN_COURS', label: 'En cours' }, { value: 'RESOLUE', label: 'Résolue' }, { value: 'IGNOREE', label: 'Ignorée' }],
  },
];

export const reportKeys = { all: ['reports'] as const, run: (type: ReportType, p: ReportParams) => ['reports', type, p] as const };

export function useReport(type: ReportType | null, params: ReportParams | null) {
  return useQuery({
    queryKey: reportKeys.run(type ?? 'daily', params ?? {}),
    queryFn: ({ signal }) => api.get<ReportResult>(`/reports/${type}`, { ...params, format: 'json' }, signal),
    enabled: !!type && !!params,
    placeholderData: keepPreviousData,
    staleTime: 0,
  });
}
