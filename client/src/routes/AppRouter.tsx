import * as React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { PageLoader } from '@/components/ui';
import { AdminLayout } from '@/components/layout/AdminLayout';
import { EmployeeLayout } from '@/components/layout/EmployeeLayout';
import { ADMIN_ROLES } from '@/components/layout/nav';
import { RequireAdminRoute, RequireAuth, RequireEmployee, RequireRole } from './guards';

// Une page = un fichier, chargé à la demande.
const Login = React.lazy(() => import('@/pages/auth/Login'));
const NotFound = React.lazy(() => import('@/pages/NotFound'));
const Kiosk = React.lazy(() => import('@/pages/public/Kiosk'));

const AdminDashboard = React.lazy(() => import('@/pages/admin/Dashboard'));
const AdminSetup = React.lazy(() => import('@/pages/admin/Setup'));
const AdminLive = React.lazy(() => import('@/pages/admin/Live'));
const AdminAnomalies = React.lazy(() => import('@/pages/admin/Anomalies'));
const AdminEmployees = React.lazy(() => import('@/pages/admin/Employees'));
const AdminEmployeeDetail = React.lazy(() => import('@/pages/admin/EmployeeDetail'));
const AdminDepartments = React.lazy(() => import('@/pages/admin/Departments'));
const AdminAttendance = React.lazy(() => import('@/pages/admin/Attendance'));
const AdminAbsences = React.lazy(() => import('@/pages/admin/Absences'));
const AdminLeaves = React.lazy(() => import('@/pages/admin/Leaves'));
const AdminOvertime = React.lazy(() => import('@/pages/admin/Overtime'));
const AdminSchedules = React.lazy(() => import('@/pages/admin/Schedules'));
const AdminHolidays = React.lazy(() => import('@/pages/admin/Holidays'));
const AdminReports = React.lazy(() => import('@/pages/admin/Reports'));
const AdminSettings = React.lazy(() => import('@/pages/admin/Settings'));
const AdminLocations = React.lazy(() => import('@/pages/admin/Locations'));
const AdminUsers = React.lazy(() => import('@/pages/admin/Users'));
const AdminAudit = React.lazy(() => import('@/pages/admin/Audit'));
const AdminBackups = React.lazy(() => import('@/pages/admin/Backups'));
const AdminNotifications = React.lazy(() => import('@/pages/admin/Notifications'));

const AppHome = React.lazy(() => import('@/pages/app/Home'));
const AppScan = React.lazy(() => import('@/pages/app/Scan'));
const AppHistory = React.lazy(() => import('@/pages/app/History'));
const AppRequests = React.lazy(() => import('@/pages/app/Requests'));
const AppCalendar = React.lazy(() => import('@/pages/app/Calendar'));
const AppProfile = React.lazy(() => import('@/pages/app/Profile'));
const AppNotifications = React.lazy(() => import('@/pages/app/Notifications'));

function Lazy({ children }: { children: React.ReactNode }) {
  return <React.Suspense fallback={<PageLoader />}>{children}</React.Suspense>;
}

function FullScreenFallback() {
  return <div className="flex min-h-dvh items-center justify-center"><PageLoader /></div>;
}

export function AppRouter() {
  return (
    <React.Suspense fallback={<FullScreenFallback />}>
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/borne/:code" element={<Kiosk />} />

        <Route element={<RequireAuth />}>
          {/* Administration (SUPER_ADMIN, HR_ADMIN, MANAGER) — droits fins dans components/layout/nav.ts */}
          <Route element={<RequireRole roles={ADMIN_ROLES} />}>
            <Route path="/admin" element={<AdminLayout />}>
              <Route element={<RequireAdminRoute />}>
                <Route index element={<Lazy><AdminDashboard /></Lazy>} />
                <Route path="setup" element={<Lazy><AdminSetup /></Lazy>} />
                <Route path="live" element={<Lazy><AdminLive /></Lazy>} />
                <Route path="anomalies" element={<Lazy><AdminAnomalies /></Lazy>} />
                <Route path="employees" element={<Lazy><AdminEmployees /></Lazy>} />
                <Route path="employees/:id" element={<Lazy><AdminEmployeeDetail /></Lazy>} />
                <Route path="departments" element={<Lazy><AdminDepartments /></Lazy>} />
                <Route path="attendance" element={<Lazy><AdminAttendance /></Lazy>} />
                <Route path="absences" element={<Lazy><AdminAbsences /></Lazy>} />
                <Route path="leaves" element={<Lazy><AdminLeaves /></Lazy>} />
                <Route path="overtime" element={<Lazy><AdminOvertime /></Lazy>} />
                <Route path="schedules" element={<Lazy><AdminSchedules /></Lazy>} />
                <Route path="holidays" element={<Lazy><AdminHolidays /></Lazy>} />
                <Route path="reports" element={<Lazy><AdminReports /></Lazy>} />
                <Route path="settings" element={<Lazy><AdminSettings /></Lazy>} />
                <Route path="locations" element={<Lazy><AdminLocations /></Lazy>} />
                <Route path="users" element={<Lazy><AdminUsers /></Lazy>} />
                <Route path="audit" element={<Lazy><AdminAudit /></Lazy>} />
                <Route path="backups" element={<Lazy><AdminBackups /></Lazy>} />
                <Route path="notifications" element={<Lazy><AdminNotifications /></Lazy>} />
                <Route path="*" element={<Lazy><NotFound /></Lazy>} />
              </Route>
            </Route>
          </Route>

          {/* Espace employé (tout utilisateur ayant une fiche employé liée) */}
          <Route element={<RequireEmployee />}>
            <Route path="/app/scan/:action" element={<Lazy><AppScan /></Lazy>} />
            <Route path="/app" element={<EmployeeLayout />}>
              <Route index element={<Lazy><AppHome /></Lazy>} />
              <Route path="history" element={<Lazy><AppHistory /></Lazy>} />
              <Route path="requests" element={<Lazy><AppRequests /></Lazy>} />
              <Route path="calendar" element={<Lazy><AppCalendar /></Lazy>} />
              <Route path="profile" element={<Lazy><AppProfile /></Lazy>} />
              <Route path="notifications" element={<Lazy><AppNotifications /></Lazy>} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </React.Suspense>
  );
}
