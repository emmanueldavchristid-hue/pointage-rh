/**
 * Résolution de l'horaire applicable à un employé pour une date donnée.
 * Priorité : affectation individuelle > affectation au département > horaire par défaut.
 * La version retenue est la dernière dont la date d'effet est ≤ à la date concernée
 * (les anciennes journées gardent donc leurs anciennes règles).
 */
import { and, desc, eq, lte, or, isNull, gte } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import type { Tx } from '../db/index.js';
import type { ScheduleRules } from './calc.js';

export type ScheduleVersion = typeof schema.scheduleVersions.$inferSelect;
export type ScheduleSource = 'EMPLOYE' | 'DEPARTEMENT' | 'DEFAUT';
export interface Resolved { source: ScheduleSource; scheduleId: number; scheduleName: string; version: ScheduleVersion }

export const toRules = (v: ScheduleVersion): ScheduleRules => ({
  startTime: v.startTime, endTime: v.endTime, breakStart: v.breakStart, breakEnd: v.breakEnd,
  workDays: v.workDays, dailyMinutes: v.dailyMinutes, lateToleranceMin: v.lateToleranceMin,
  earlyLeaveToleranceMin: v.earlyLeaveToleranceMin, overtimeThresholdMin: v.overtimeThresholdMin,
  breakTracking: v.breakTracking, maxBreaks: v.maxBreaks, arrivalWindowBeforeMin: v.arrivalWindowBeforeMin,
});

/** Chargeur groupé (dashboard, clôture de journée) : une seule série de requêtes pour N employés */
export async function loadScheduleResolver(d: typeof db | Tx = db) {
  const [scheds, versions, assigns] = await Promise.all([
    d.select().from(schema.schedules),
    d.select().from(schema.scheduleVersions).orderBy(desc(schema.scheduleVersions.effectiveFrom)),
    d.select().from(schema.scheduleAssignments).orderBy(desc(schema.scheduleAssignments.effectiveFrom), desc(schema.scheduleAssignments.id)),
  ]);
  const byId = new Map(scheds.map((s) => [s.id, s]));
  const def = scheds.find((s) => s.isDefault && s.active);
  const covers = (a: { effectiveFrom: string; effectiveTo: string | null }, date: string) =>
    a.effectiveFrom <= date && (!a.effectiveTo || a.effectiveTo >= date);
  const versionFor = (scheduleId: number, date: string) => versions.find((v) => v.scheduleId === scheduleId && v.effectiveFrom <= date);

  return function resolve(emp: { id: number; departmentId: number | null }, date: string): Resolved | null {
    const tryAssign = (pred: (a: typeof assigns[number]) => boolean, source: ScheduleSource) => {
      const a = assigns.find((x) => pred(x) && covers(x, date));
      if (!a) return null;
      const s = byId.get(a.scheduleId); const v = s && versionFor(a.scheduleId, date);
      return s && v ? { source, scheduleId: s.id, scheduleName: s.name, version: v } : null;
    };
    return tryAssign((a) => a.employeeId === emp.id, 'EMPLOYE')
      ?? (emp.departmentId ? tryAssign((a) => a.departmentId === emp.departmentId && !a.employeeId, 'DEPARTEMENT') : null)
      ?? (def ? (() => { const v = versionFor(def.id, date); return v ? { source: 'DEFAUT' as const, scheduleId: def.id, scheduleName: def.name, version: v } : null; })() : null);
  };
}

export async function resolveSchedule(employeeId: number, date: string, d: typeof db | Tx = db): Promise<Resolved | null> {
  const [emp] = await d.select({ id: schema.employees.id, departmentId: schema.employees.departmentId }).from(schema.employees).where(eq(schema.employees.id, employeeId));
  if (!emp) return null;
  const resolve = await loadScheduleResolver(d);
  return resolve(emp, date);
}

export { and, eq, lte, or, isNull, gte };
