import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface DashboardKpis {
  activeEmployees: number; presentToday: number; absentToday: number; lateToday: number; onLeave: number; presenceRate: number;
  incomplete: number; overtimePending: number; openAnomalies: number; notArrivedYet: number; pendingLeaves?: number;
}
export interface DashboardCharts {
  presenceDaily: { date: string; present: number; absent: number; late: number }[];
  lateMonthly: { month: string; count: number; minutes: number }[];
  absenceBreakdown: { status: string; count: number }[];
  presenceByDepartment: { department: string; rate: number }[];
  overtimeByDepartment: { department: string; minutes: number }[];
  presenceRateTrend: { date: string; rate: number }[];
}

export const dashboardKeys = {
  kpis: (f: { date?: string; departmentId?: string }) => ['dashboard', 'kpis', f] as const,
  charts: (f: { from: string; to: string; departmentId?: string }) => ['dashboard', 'charts', f] as const,
};

export function useKpis(f: { date?: string; departmentId?: string }) {
  return useQuery({
    queryKey: dashboardKeys.kpis(f),
    queryFn: ({ signal }) => api.get<DashboardKpis>('/dashboard/kpis', { ...f }, signal),
    refetchInterval: 60_000,
    placeholderData: keepPreviousData,
  });
}

export function useCharts(f: { from: string; to: string; departmentId?: string }) {
  return useQuery({
    queryKey: dashboardKeys.charts(f),
    queryFn: ({ signal }) => api.get<DashboardCharts>('/dashboard/charts', { ...f }, signal),
    placeholderData: keepPreviousData,
  });
}
