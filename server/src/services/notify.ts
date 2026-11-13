import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import type { Tx } from '../db/index.js';

type N = { type: string; title: string; body?: string; link?: string };

export async function notifyUsers(userIds: number[], n: N, tx?: Tx) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return;
  await (tx ?? db).insert(schema.notifications).values(ids.map((userId) => ({ userId, ...n })));
}

export async function userIdOfEmployee(employeeId: number, tx?: Tx) {
  const [u] = await (tx ?? db).select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.employeeId, employeeId));
  return u?.id;
}
export async function notifyEmployee(employeeId: number, n: N, tx?: Tx) {
  const uid = await userIdOfEmployee(employeeId, tx);
  if (uid) await notifyUsers([uid], n, tx);
}
/** Responsable : manager hiérarchique direct, sinon responsable du département, sinon comptes MANAGER du département */
export async function managerUserIdsFor(employeeId: number, tx?: Tx): Promise<number[]> {
  const d = tx ?? db;
  const [e] = await d.select().from(schema.employees).where(eq(schema.employees.id, employeeId));
  if (!e) return [];
  const mgrEmpIds: number[] = [];
  if (e.managerId) mgrEmpIds.push(e.managerId);
  if (e.departmentId) {
    const [dep] = await d.select().from(schema.departments).where(eq(schema.departments.id, e.departmentId));
    if (dep?.managerEmployeeId) mgrEmpIds.push(dep.managerEmployeeId);
  }
  const ids = mgrEmpIds.filter((x) => x !== employeeId);
  if (!ids.length) return [];
  const us = await d.select({ id: schema.users.id }).from(schema.users).where(and(inArray(schema.users.employeeId, ids), eq(schema.users.active, true)));
  return us.map((u) => u.id);
}
export async function hrUserIds(tx?: Tx) {
  const us = await (tx ?? db).select({ id: schema.users.id }).from(schema.users)
    .where(and(inArray(schema.users.role, ['HR_ADMIN', 'SUPER_ADMIN']), eq(schema.users.active, true)));
  return us.map((u) => u.id);
}
