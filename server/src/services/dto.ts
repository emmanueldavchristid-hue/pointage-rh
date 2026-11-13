import { alias } from 'drizzle-orm/pg-core';
import { eq, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';

export const fileUrl = (p: string | null | undefined) => (p ? `/uploads/${p}` : null);
const mgr = alias(schema.employees, 'mgr');

/** Requête de base employé enrichi (département, poste, responsable, rôle) */
export function employeeQuery() {
  return db.select({
    e: schema.employees, dep: schema.departments.name, pos: schema.positions.title,
    mgrFirst: mgr.firstNames, mgrLast: mgr.lastName, role: schema.users.role, login: schema.users.login,
    userActive: schema.users.active, lastLoginAt: schema.users.lastLoginAt,
  }).from(schema.employees)
    .leftJoin(schema.departments, eq(schema.departments.id, schema.employees.departmentId))
    .leftJoin(schema.positions, eq(schema.positions.id, schema.employees.positionId))
    .leftJoin(mgr, eq(mgr.id, schema.employees.managerId))
    .leftJoin(schema.users, eq(schema.users.employeeId, schema.employees.id));
}

export function toEmployeeDto(r: any) {
  const e = r.e;
  return {
    id: e.id, matricule: e.matricule, lastName: e.lastName, firstNames: e.firstNames, fullName: `${e.firstNames} ${e.lastName}`,
    photoUrl: fileUrl(e.photoPath), email: e.email, phone: e.phone, gender: e.gender, birthDate: e.birthDate,
    departmentId: e.departmentId, departmentName: r.dep ?? null, positionId: e.positionId, positionTitle: r.pos ?? null,
    hireDate: e.hireDate, contractType: e.contractType, status: e.status, managerId: e.managerId,
    managerName: r.mgrFirst ? `${r.mgrFirst} ${r.mgrLast}` : null, role: r.role ?? null, isDemo: e.isDemo, createdAt: e.createdAt,
    user: r.login ? { login: r.login, role: r.role, active: r.userActive, lastLoginAt: r.lastLoginAt } : null,
  };
}

/** Résumé employé pour les listes de présence */
export const empBrief = {
  fullName: sql<string>`${schema.employees.firstNames} || ' ' || ${schema.employees.lastName}`,
  matricule: schema.employees.matricule,
  photoPath: schema.employees.photoPath,
  departmentId: schema.employees.departmentId,
  departmentName: schema.departments.name,
};
