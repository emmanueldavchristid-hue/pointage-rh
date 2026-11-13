/** Contexte d'une journée : jour férié, congé/permission/mission approuvé, justificatif validé */
import { and, eq, gte, lte, inArray } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import type { Tx } from '../db/index.js';

export interface LeaveInfo { requestId: number; category: string; label: string; code: string }

export async function loadHolidays(d: typeof db | Tx = db) {
  const rows = await d.select().from(schema.holidays);
  return {
    rows,
    label(date: string): string | null {
      const h = rows.find((r) => r.date === date || (r.recurring && r.date.slice(5) === date.slice(5)));
      return h?.label ?? null;
    },
  };
}

/** Congés approuvés sur une période, indexés employé → date → info */
export async function loadApprovedLeaves(from: string, to: string, employeeIds?: number[], d: typeof db | Tx = db) {
  const conds = [eq(schema.leaveRequests.status, 'APPROUVE'), lte(schema.leaveRequests.startDate, to), gte(schema.leaveRequests.endDate, from)];
  if (employeeIds?.length) conds.push(inArray(schema.leaveRequests.employeeId, employeeIds));
  const rows = await d.select({
    id: schema.leaveRequests.id, employeeId: schema.leaveRequests.employeeId, startDate: schema.leaveRequests.startDate,
    endDate: schema.leaveRequests.endDate, category: schema.leaveTypes.category, label: schema.leaveTypes.label, code: schema.leaveTypes.code,
  }).from(schema.leaveRequests).innerJoin(schema.leaveTypes, eq(schema.leaveTypes.id, schema.leaveRequests.leaveTypeId)).where(and(...conds));
  return {
    rows,
    get(employeeId: number, date: string): LeaveInfo | null {
      const r = rows.find((x) => x.employeeId === employeeId && x.startDate <= date && x.endDate >= date);
      return r ? { requestId: r.id, category: r.category, label: r.label, code: r.code } : null;
    },
  };
}

export function leaveDayStatus(category: string): 'CONGE' | 'PERMISSION' | 'MISSION' | 'ABSENCE_JUSTIFIEE' {
  if (category === 'CONGE') return 'CONGE';
  if (category === 'PERMISSION') return 'PERMISSION';
  if (category === 'MISSION') return 'MISSION';
  return 'ABSENCE_JUSTIFIEE';
}
