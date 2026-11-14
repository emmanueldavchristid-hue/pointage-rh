/**
 * Rapports : un constructeur unique produit {titre, période, synthèse, colonnes, lignes},
 * rendu ensuite en JSON, Excel (ExcelJS), PDF (PDFKit, logo + pagination) ou CSV.
 */
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import { DateTime } from 'luxon';
import { and, desc, eq, gte, lte, sql, inArray, asc } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { ah, parse, zDate, zId } from '../utils/http.js';
import { badRequest } from '../utils/errors.js';
import { requireRole, STAFF, assertCanAccessEmployee } from '../middlewares/auth.js';
import { audit } from '../services/audit.js';
import { empBrief } from '../services/dto.js';
import { scopeConds } from './attendance.js';
import { getCompany } from '../services/settings.js';
import { absUpload } from '../services/files.js';
import { fmtDate, fmtMinutes, fmtTime, localDate, addDays } from '../utils/time.js';

export const router = Router();
router.use(requireRole(...STAFF));

type Col = { key: string; label: string; width?: number; align?: 'left' | 'right' | 'center' };
interface Report { title: string; subtitle?: string; period: { from: string; to: string }; generatedAt: Date; summary: { label: string; value: string | number }[]; columns: Col[]; rows: Record<string, any>[] }

const STATUS_FR: Record<string, string> = {
  EN_COURS: 'En cours', PRESENT: 'Présent', RETARD: 'Retard', ABSENCE_NON_JUSTIFIEE: 'Absence non justifiée', ABSENCE_JUSTIFIEE: 'Absence justifiée', CONGE: 'Congé',
  PERMISSION: 'Permission', MISSION: 'Mission', FERIE: 'Férié', NON_TRAVAILLE: 'Non travaillé', INCOMPLET: 'Pointage incomplet',
  NON_POINTE: 'Non pointé', EN_PAUSE: 'En pause', DE_RETOUR_DE_PAUSE: 'De retour de pause', PARTI: 'Parti', POINTAGE_INCOMPLET: 'Incomplet', ANOMALIE: 'Anomalie',
  BROUILLON: 'Brouillon', EN_ATTENTE: 'En attente', APPROUVE: 'Approuvé', REFUSE: 'Refusé', ANNULE: 'Annulé', VALIDE: 'Validé',
  OUVERTE: 'Ouverte', RESOLUE: 'Résolue', IGNOREE: 'Ignorée', FAIBLE: 'Faible', MOYENNE: 'Moyenne', ELEVEE: 'Élevée', CRITIQUE: 'Critique',
};
const fr = (s: string | null | undefined) => (s ? STATUS_FR[s] ?? s.replace(/_/g, ' ').toLowerCase() : '');
const h = (m: number) => fmtMinutes(m);
const pct = (v: number) => `${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`;

const Q = z.object({ from: zDate.optional(), to: zDate.optional(), date: zDate.optional(), employeeId: zId.optional(), departmentId: zId.optional(),
  status: z.string().max(100).optional(), format: z.enum(['json', 'xlsx', 'pdf', 'csv']).default('json') });
type Params = z.infer<typeof Q> & { from: string; to: string };

async function attendanceRows(req: Request, p: Params, extra: any[] = []) {
  const A = schema.attendances;
  return db.select({ a: A, ...empBrief }).from(A).innerJoin(schema.employees, eq(schema.employees.id, A.employeeId))
    .leftJoin(schema.departments, eq(schema.departments.id, schema.employees.departmentId))
    .where(and(gte(A.workDate, p.from), lte(A.workDate, p.to), ...scopeConds(req, p), ...extra)).orderBy(asc(A.workDate), asc(schema.employees.lastName));
}

async function aggregateByEmployee(req: Request, p: Params) {
  const A = schema.attendances;
  const rows = await db.select({ employeeId: A.employeeId, ...empBrief,
    daysPresent: sql<number>`count(*) filter (where ${A.arrivalAt} is not null)::int`, lateCount: sql<number>`count(*) filter (where ${A.lateMinutes} > 0)::int`,
    lateMinutes: sql<number>`coalesce(sum(${A.lateMinutes}),0)::int`, unjustified: sql<number>`count(*) filter (where ${A.dayStatus} = 'ABSENCE_NON_JUSTIFIEE')::int`,
    justified: sql<number>`count(*) filter (where ${A.dayStatus} = 'ABSENCE_JUSTIFIEE')::int`, leave: sql<number>`count(*) filter (where ${A.dayStatus} in ('CONGE','PERMISSION','MISSION'))::int`,
    incomplete: sql<number>`count(*) filter (where ${A.dayStatus} = 'INCOMPLET')::int`, worked: sql<number>`coalesce(sum(${A.workedMinutes}),0)::int`,
    expected: sql<number>`coalesce(sum(${A.expectedMinutes}),0)::int`, otPotential: sql<number>`coalesce(sum(${A.overtimePotentialMinutes}),0)::int`,
    otValidated: sql<number>`coalesce((select sum(o.validated_minutes) from overtime_records o where o.employee_id = ${A.employeeId} and o.status = 'VALIDE' and o.work_date between ${p.from} and ${p.to}),0)::int` })
    .from(A).innerJoin(schema.employees, eq(schema.employees.id, A.employeeId)).leftJoin(schema.departments, eq(schema.departments.id, schema.employees.departmentId))
    .where(and(gte(A.workDate, p.from), lte(A.workDate, p.to), ...scopeConds(req, p)))
    .groupBy(A.employeeId, schema.employees.firstNames, schema.employees.lastName, schema.employees.matricule, schema.employees.photoPath, schema.employees.departmentId, schema.departments.name)
    .orderBy(schema.employees.lastName);
  return rows.map((r) => ({ ...r, rate: r.daysPresent + r.unjustified + r.justified ? Math.round((r.daysPresent / (r.daysPresent + r.unjustified + r.justified)) * 1000) / 10 : null }));
}

const periodCols: Col[] = [
  { key: 'matricule', label: 'Matricule', width: 60 }, { key: 'fullName', label: 'Employé', width: 120 }, { key: 'departmentName', label: 'Département', width: 90 },
  { key: 'daysPresent', label: 'Jours présents', align: 'right' }, { key: 'lateCount', label: 'Retards', align: 'right' }, { key: 'lateH', label: 'Cumul retards', align: 'right' },
  { key: 'unjustified', label: 'Abs. non just.', align: 'right' }, { key: 'justified', label: 'Abs. just.', align: 'right' }, { key: 'leave', label: 'Congés/missions', align: 'right' },
  { key: 'workedH', label: 'Travail effectif', align: 'right' }, { key: 'expectedH', label: 'Théorique', align: 'right' }, { key: 'otH', label: 'HS potentielles', align: 'right' },
  { key: 'otValH', label: 'HS validées', align: 'right' }, { key: 'rateTxt', label: 'Taux présence', align: 'right' },
];

async function build(type: string, req: Request, p: Params, tz: string): Promise<Report> {
  const base = { period: { from: p.from, to: p.to }, generatedAt: new Date() };
  const attCols: Col[] = [
    { key: 'workDate', label: 'Date', width: 60 }, { key: 'matricule', label: 'Matricule', width: 60 }, { key: 'fullName', label: 'Employé', width: 120 },
    { key: 'departmentName', label: 'Département', width: 90 }, { key: 'arrival', label: 'Arrivée', align: 'center' }, { key: 'departure', label: 'Départ', align: 'center' },
    { key: 'lateTxt', label: 'Retard', align: 'right' }, { key: 'presenceH', label: 'Présence', align: 'right' }, { key: 'workedH', label: 'Effectif', align: 'right' },
    { key: 'otH', label: 'HS pot.', align: 'right' }, { key: 'status', label: 'Statut', width: 100 },
  ];
  const attMap = (r: any) => ({ workDate: fmtDate(r.a.workDate), matricule: r.matricule, fullName: r.fullName, departmentName: r.departmentName ?? '',
    arrival: fmtTime(r.a.arrivalAt, tz), departure: fmtTime(r.a.departureAt, tz), lateTxt: r.a.lateMinutes ? `${r.a.lateMinutes} min` : '', lateMinutes: r.a.lateMinutes,
    presenceH: r.a.presenceMinutes ? h(r.a.presenceMinutes) : '', workedH: r.a.workedMinutes ? h(r.a.workedMinutes) : '', workedMinutes: r.a.workedMinutes,
    otH: r.a.overtimePotentialMinutes ? h(r.a.overtimePotentialMinutes) : '', status: fr(r.a.dayStatus) + (r.a.corrected ? ' (corrigé)' : '') });

  switch (type) {
    case 'daily': {
      const rows = await attendanceRows(req, { ...p, to: p.from });
      const present = rows.filter((r) => r.a.arrivalAt).length;
      const absent = rows.filter((r) => ['ABSENCE_NON_JUSTIFIEE', 'ABSENCE_JUSTIFIEE'].includes(r.a.dayStatus)).length;
      return { ...base, period: { from: p.from, to: p.from }, title: 'Rapport journalier des présences', subtitle: DateTime.fromISO(p.from).setLocale('fr').toFormat('cccc d LLLL yyyy'),
        summary: [{ label: 'Présents', value: present }, { label: 'Retards', value: rows.filter((r) => r.a.lateMinutes > 0).length }, { label: 'Absents', value: absent },
          { label: 'Congés / missions', value: rows.filter((r) => ['CONGE', 'PERMISSION', 'MISSION'].includes(r.a.dayStatus)).length },
          { label: 'Pointages incomplets', value: rows.filter((r) => r.a.dayStatus === 'INCOMPLET').length }],
        columns: attCols.filter((c) => c.key !== 'workDate'), rows: rows.filter((r) => r.a.dayStatus !== 'NON_TRAVAILLE').map(attMap) };
    }
    case 'weekly': case 'monthly': case 'department': {
      const agg = await aggregateByEmployee(req, p);
      const tot = agg.reduce((s, r) => ({ present: s.present + r.daysPresent, late: s.late + r.lateCount, lateM: s.lateM + r.lateMinutes, abs: s.abs + r.unjustified + r.justified, worked: s.worked + r.worked, ot: s.ot + r.otPotential, otv: s.otv + r.otValidated }),
        { present: 0, late: 0, lateM: 0, abs: 0, worked: 0, ot: 0, otv: 0 });
      const summary = [{ label: 'Employés', value: agg.length }, { label: 'Jours de présence', value: tot.present }, { label: 'Retards', value: `${tot.late} (${h(tot.lateM)})` },
        { label: 'Absences', value: tot.abs }, { label: 'Travail effectif', value: h(tot.worked) }, { label: 'HS potentielles / validées', value: `${h(tot.ot)} / ${h(tot.otv)}` }];
      if (type === 'department') {
        const deps = new Map<string, any>();
        for (const r of agg) {
          const k = r.departmentName ?? 'Sans département';
          const d = deps.get(k) ?? { departmentName: k, employees: 0, daysPresent: 0, lateCount: 0, lateMinutes: 0, absences: 0, leave: 0, worked: 0, ot: 0, otv: 0 };
          d.employees++; d.daysPresent += r.daysPresent; d.lateCount += r.lateCount; d.lateMinutes += r.lateMinutes; d.absences += r.unjustified + r.justified; d.leave += r.leave; d.worked += r.worked; d.ot += r.otPotential; d.otv += r.otValidated;
          deps.set(k, d);
        }
        return { ...base, title: 'Rapport par département', summary, columns: [{ key: 'departmentName', label: 'Département', width: 130 }, { key: 'employees', label: 'Employés', align: 'right' },
          { key: 'daysPresent', label: 'Jours présents', align: 'right' }, { key: 'lateCount', label: 'Retards', align: 'right' }, { key: 'lateH', label: 'Cumul retards', align: 'right' },
          { key: 'absences', label: 'Absences', align: 'right' }, { key: 'leave', label: 'Congés/missions', align: 'right' }, { key: 'workedH', label: 'Travail effectif', align: 'right' },
          { key: 'otH', label: 'HS potentielles', align: 'right' }, { key: 'otValH', label: 'HS validées', align: 'right' }, { key: 'rateTxt', label: 'Taux présence', align: 'right' }],
          rows: [...deps.values()].map((d) => ({ ...d, lateH: h(d.lateMinutes), workedH: h(d.worked), otH: h(d.ot), otValH: h(d.otv),
            rateTxt: d.daysPresent + d.absences ? pct(Math.round((d.daysPresent / (d.daysPresent + d.absences)) * 1000) / 10) : '—' })) };
      }
      return { ...base, title: type === 'weekly' ? 'Rapport hebdomadaire des présences' : 'Rapport mensuel des présences', summary, columns: periodCols,
        rows: agg.map((r) => ({ ...r, lateH: h(r.lateMinutes), workedH: h(r.worked), expectedH: h(r.expected), otH: h(r.otPotential), otValH: h(r.otValidated), rateTxt: r.rate != null ? pct(r.rate) : '—' })) };
    }
    case 'employee': {
      if (!p.employeeId) throw badRequest('EMPLOYEE_REQUIRED', 'Sélectionnez un employé.');
      await assertCanAccessEmployee(req, p.employeeId);
      const rows = await attendanceRows(req, p);
      const [e] = await db.select().from(schema.employees).where(eq(schema.employees.id, p.employeeId));
      const worked = rows.reduce((s, r) => s + r.a.workedMinutes, 0); const expected = rows.reduce((s, r) => s + r.a.expectedMinutes, 0);
      return { ...base, title: 'Rapport individuel', subtitle: `${e.firstNames} ${e.lastName} — ${e.matricule}`,
        summary: [{ label: 'Jours présents', value: rows.filter((r) => r.a.arrivalAt).length }, { label: 'Retards', value: rows.filter((r) => r.a.lateMinutes > 0).length },
          { label: 'Cumul retards', value: h(rows.reduce((s, r) => s + r.a.lateMinutes, 0)) }, { label: 'Absences non justifiées', value: rows.filter((r) => r.a.dayStatus === 'ABSENCE_NON_JUSTIFIEE').length },
          { label: 'Travail effectif / théorique', value: `${h(worked)} / ${h(expected)}` }, { label: 'HS potentielles', value: h(rows.reduce((s, r) => s + r.a.overtimePotentialMinutes, 0)) }],
        columns: attCols.filter((c) => !['matricule', 'fullName', 'departmentName'].includes(c.key)), rows: rows.map(attMap) };
    }
    case 'late': {
      const rows = await attendanceRows(req, p, [sql`${schema.attendances.lateMinutes} > 0`]);
      const total = rows.reduce((s, r) => s + r.a.lateMinutes, 0);
      return { ...base, title: 'Rapport des retards', summary: [{ label: 'Retards', value: rows.length }, { label: 'Cumul', value: h(total) },
        { label: 'Retard moyen', value: rows.length ? `${Math.round(total / rows.length)} min` : '—' }, { label: 'Employés concernés', value: new Set(rows.map((r) => r.a.employeeId)).size }],
        columns: [...attCols.slice(0, 5), { key: 'expected', label: 'Brut', align: 'right' }, { key: 'lateTxt', label: 'Retenu', align: 'right' }, { key: 'status', label: 'Statut', width: 90 }],
        rows: rows.map((r) => ({ ...attMap(r), expected: `${r.a.lateRawMinutes} min` })) };
    }
    case 'absences': {
      const st = p.status ? p.status.split(',') : ['ABSENCE_NON_JUSTIFIEE', 'ABSENCE_JUSTIFIEE', 'CONGE', 'PERMISSION', 'MISSION'];
      const rows = await attendanceRows(req, p, [inArray(schema.attendances.dayStatus, st as any)]);
      const count = (s: string[]) => rows.filter((r) => s.includes(r.a.dayStatus)).length;
      return { ...base, title: 'Rapport des absences', summary: [{ label: 'Non justifiées', value: count(['ABSENCE_NON_JUSTIFIEE']) }, { label: 'Justifiées', value: count(['ABSENCE_JUSTIFIEE']) },
        { label: 'Congés / permissions', value: count(['CONGE', 'PERMISSION']) }, { label: 'Missions', value: count(['MISSION']) }],
        columns: [attCols[0], attCols[1], attCols[2], attCols[3], { key: 'status', label: 'Qualification', width: 120 }], rows: rows.map(attMap) };
    }
    case 'leaves': {
      const L = schema.leaveRequests;
      const conds: any[] = [lte(L.startDate, p.to), sql`${L.endDate} >= ${p.from}`, sql`${L.status} <> 'BROUILLON'`, ...scopeConds(req, p)];
      if (p.status) conds.push(inArray(L.status, p.status.split(',') as any));
      const rows = await db.select({ l: L, t: schema.leaveTypes, ...empBrief }).from(L).innerJoin(schema.leaveTypes, eq(schema.leaveTypes.id, L.leaveTypeId))
        .innerJoin(schema.employees, eq(schema.employees.id, L.employeeId)).leftJoin(schema.departments, eq(schema.departments.id, schema.employees.departmentId))
        .where(and(...conds)).orderBy(L.startDate);
      return { ...base, title: 'Rapport des congés et permissions', summary: [{ label: 'Demandes', value: rows.length }, { label: 'Approuvées', value: rows.filter((r) => r.l.status === 'APPROUVE').length },
        { label: 'En attente', value: rows.filter((r) => r.l.status === 'EN_ATTENTE').length }, { label: 'Jours ouvrés approuvés', value: rows.filter((r) => r.l.status === 'APPROUVE').reduce((s, r) => s + r.l.workingDays, 0) }],
        columns: [{ key: 'matricule', label: 'Matricule' }, { key: 'fullName', label: 'Employé', width: 120 }, { key: 'departmentName', label: 'Département', width: 90 }, { key: 'type', label: 'Type', width: 110 },
          { key: 'start', label: 'Du' }, { key: 'end', label: 'Au' }, { key: 'workingDays', label: 'Jours ouvrés', align: 'right' }, { key: 'status', label: 'Statut' }, { key: 'manager', label: 'Avis responsable' }],
        rows: rows.map((r) => ({ matricule: r.matricule, fullName: r.fullName, departmentName: r.departmentName ?? '', type: r.t.label, start: fmtDate(r.l.startDate), end: fmtDate(r.l.endDate),
          workingDays: r.l.workingDays, status: fr(r.l.status), manager: r.l.managerDecision ? (r.l.managerDecision === 'FAVORABLE' ? 'Favorable' : 'Défavorable') : '' })) };
    }
    case 'overtime': {
      const O = schema.overtimeRecords;
      const conds: any[] = [gte(O.workDate, p.from), lte(O.workDate, p.to), ...scopeConds(req, p)];
      if (p.status) conds.push(inArray(O.status, p.status.split(',') as any));
      const rows = await db.select({ o: O, a: schema.attendances, ...empBrief }).from(O).innerJoin(schema.attendances, eq(schema.attendances.id, O.attendanceId))
        .innerJoin(schema.employees, eq(schema.employees.id, O.employeeId)).leftJoin(schema.departments, eq(schema.departments.id, schema.employees.departmentId))
        .where(and(...conds)).orderBy(O.workDate);
      return { ...base, title: 'Rapport des heures supplémentaires', summary: [{ label: 'Potentielles', value: h(rows.reduce((s, r) => s + r.o.potentialMinutes, 0)) },
        { label: 'Validées', value: h(rows.reduce((s, r) => s + (r.o.status === 'VALIDE' ? r.o.validatedMinutes ?? 0 : 0), 0)) }, { label: 'En attente', value: rows.filter((r) => r.o.status === 'EN_ATTENTE').length },
        { label: 'Refusées', value: rows.filter((r) => r.o.status === 'REFUSE').length }],
        columns: [{ key: 'date', label: 'Date' }, { key: 'matricule', label: 'Matricule' }, { key: 'fullName', label: 'Employé', width: 120 }, { key: 'departmentName', label: 'Département', width: 90 },
          { key: 'arrival', label: 'Arrivée' }, { key: 'departure', label: 'Départ' }, { key: 'workedH', label: 'Effectif', align: 'right' }, { key: 'expectedH', label: 'Théorique', align: 'right' },
          { key: 'potentialH', label: 'HS potentielles', align: 'right' }, { key: 'validatedH', label: 'HS validées', align: 'right' }, { key: 'status', label: 'Statut' }, { key: 'rate', label: 'Taux' }],
        rows: rows.map((r) => ({ date: fmtDate(r.o.workDate), matricule: r.matricule, fullName: r.fullName, departmentName: r.departmentName ?? '', arrival: fmtTime(r.a.arrivalAt, tz),
          departure: fmtTime(r.a.departureAt, tz), workedH: h(r.a.workedMinutes), expectedH: h(r.a.expectedMinutes), potentialH: h(r.o.potentialMinutes),
          validatedH: r.o.validatedMinutes != null ? h(r.o.validatedMinutes) : '', status: fr(r.o.status), rate: r.o.rateCode ?? '' })) };
    }
    case 'anomalies': {
      const X = schema.anomalies;
      const conds: any[] = [gte(X.workDate, p.from), lte(X.workDate, p.to), ...scopeConds(req, p)];
      if (p.status) conds.push(inArray(X.status, p.status.split(',') as any));
      const rows = await db.select({ x: X, ...empBrief }).from(X).innerJoin(schema.employees, eq(schema.employees.id, X.employeeId))
        .leftJoin(schema.departments, eq(schema.departments.id, schema.employees.departmentId)).where(and(...conds)).orderBy(desc(X.workDate));
      return { ...base, title: 'Rapport des anomalies de pointage', summary: [{ label: 'Anomalies', value: rows.length }, { label: 'Ouvertes', value: rows.filter((r) => ['OUVERTE', 'EN_COURS'].includes(r.x.status)).length },
        { label: 'Gravité élevée', value: rows.filter((r) => ['ELEVEE', 'CRITIQUE'].includes(r.x.severity)).length }, { label: 'Résolues', value: rows.filter((r) => r.x.status === 'RESOLUE').length }],
        columns: [{ key: 'date', label: 'Date' }, { key: 'matricule', label: 'Matricule' }, { key: 'fullName', label: 'Employé', width: 110 }, { key: 'type', label: 'Type', width: 110 },
          { key: 'severity', label: 'Gravité' }, { key: 'status', label: 'Statut' }, { key: 'message', label: 'Description', width: 200 }],
        rows: rows.map((r) => ({ date: fmtDate(r.x.workDate), matricule: r.matricule, fullName: r.fullName, type: fr(r.x.type), severity: fr(r.x.severity), status: fr(r.x.status), message: r.x.message })) };
    }
    default: throw badRequest('REPORT_TYPE', 'Type de rapport inconnu.');
  }
}

/* --------------------------------------------------------------- rendus */
async function toXlsx(r: Report, res: Response, company: any) {
  const wb = new ExcelJS.Workbook(); wb.creator = company?.name ?? 'Pointage RH';
  const ws = wb.addWorksheet(r.title.slice(0, 31));
  ws.addRow([company?.name ?? '']).font = { bold: true, size: 12 };
  ws.addRow([r.title + (r.subtitle ? ` — ${r.subtitle}` : '')]).font = { bold: true, size: 14, color: { argb: 'FF111827' } };
  ws.addRow([`Période : ${fmtDate(r.period.from)} au ${fmtDate(r.period.to)}`, '', '', `Généré le ${DateTime.fromJSDate(r.generatedAt).setZone(company?.timezone ?? 'Africa/Abidjan').toFormat('dd/MM/yyyy HH:mm')}`]);
  ws.addRow([]);
  for (const s of r.summary) ws.addRow([s.label, s.value]).getCell(1).font = { color: { argb: 'FF64748B' } };
  ws.addRow([]);
  const header = ws.addRow(r.columns.map((c) => c.label));
  header.eachCell((c) => { c.font = { bold: true, color: { argb: 'FFFFFFFF' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111827' } }; c.alignment = { vertical: 'middle' }; });
  for (const row of r.rows) ws.addRow(r.columns.map((c) => row[c.key] ?? ''));
  r.columns.forEach((c, i) => { ws.getColumn(i + 1).width = Math.max(12, Math.round((c.width ?? 70) / 5)); });
  ws.views = [{ state: 'frozen', ySplit: header.number }];
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  await wb.xlsx.write(res); res.end();
}

function toCsv(r: Report, res: Response) {
  const esc = (v: any) => { const s = String(v ?? ''); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [r.columns.map((c) => esc(c.label)).join(';'), ...r.rows.map((row) => r.columns.map((c) => esc(row[c.key])).join(';'))];
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.send('﻿' + lines.join('\r\n')); // BOM + « ; » pour Excel en français
}

function toPdf(r: Report, res: Response, company: any) {
  const landscape = r.columns.length > 7;
  const doc = new PDFDocument({ size: 'A4', layout: landscape ? 'landscape' : 'portrait', margin: 36, bufferPages: true, info: { Title: r.title, Author: company?.name ?? 'Pointage RH' } });
  res.setHeader('Content-Type', 'application/pdf');
  doc.pipe(res);
  const W = doc.page.width - 72; const left = 36;
  // en-tête : logo + établissement + titre
  let x = left;
  if (company?.logoPath && /\.(png|jpe?g)$/i.test(company.logoPath) && fs.existsSync(absUpload(company.logoPath))) {
    try { doc.image(absUpload(company.logoPath), left, 30, { fit: [48, 48] }); x = left + 58; } catch { /* logo illisible ignoré */ }
  }
  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(11).text(company?.name ?? '', x, 32, { width: W - (x - left) });
  doc.font('Helvetica').fontSize(8).fillColor('#64748B').text([company?.address, company?.phone, company?.email].filter(Boolean).join(' · '), x, doc.y + 1, { width: W - (x - left) });
  doc.moveTo(left, 86).lineTo(left + W, 86).lineWidth(0.5).strokeColor('#E2E8F0').stroke();
  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(16).text(r.title, left, 96);
  if (r.subtitle) doc.font('Helvetica').fontSize(10).fillColor('#334155').text(r.subtitle);
  doc.font('Helvetica').fontSize(9).fillColor('#64748B')
    .text(`Période : ${fmtDate(r.period.from)} au ${fmtDate(r.period.to)}   ·   Généré le ${DateTime.fromJSDate(r.generatedAt).setZone(company?.timezone ?? 'Africa/Abidjan').toFormat("dd/MM/yyyy 'à' HH:mm")}`);
  // indicateurs synthétiques
  let y = doc.y + 10;
  const n = Math.min(6, r.summary.length); const bw = (W - (n - 1) * 8) / Math.max(1, n);
  r.summary.slice(0, 6).forEach((s, i) => {
    const bx = left + i * (bw + 8);
    doc.roundedRect(bx, y, bw, 44, 6).fillAndStroke('#F8FAFC', '#E2E8F0');
    doc.fillColor('#64748B').font('Helvetica').fontSize(6.5).text(s.label.toUpperCase(), bx + 8, y + 7, { width: bw - 16, height: 9, lineBreak: false, ellipsis: true });
    doc.fillColor('#111827').font('Helvetica-Bold').fontSize(11).text(String(s.value), bx + 8, y + 23, { width: bw - 16, height: 14, lineBreak: false, ellipsis: true });
  });
  y += 58;
  // tableau
  const totalW = r.columns.reduce((s, c) => s + (c.width ?? 60), 0);
  const widths = r.columns.map((c) => ((c.width ?? 60) / totalW) * W);
  const drawHeader = () => {
    doc.rect(left, y, W, 24).fill('#111827');
    let cx = left;
    r.columns.forEach((c, i) => { doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(7.5).text(c.label, cx + 4, y + 4, { width: widths[i] - 8, height: 18, align: c.align ?? 'left', ellipsis: true }); cx += widths[i]; });
    y += 24;
  };
  drawHeader();
  const bottom = doc.page.height - 50;
  r.rows.forEach((row, ri) => {
    const rh = 16;
    if (y + rh > bottom) { doc.addPage(); y = 40; drawHeader(); }
    if (ri % 2 === 1) doc.rect(left, y, W, rh).fill('#F8FAFC');
    let cx = left;
    r.columns.forEach((c, i) => { doc.fillColor('#1E293B').font('Helvetica').fontSize(7.5).text(String(row[c.key] ?? ''), cx + 4, y + 4.5, { width: widths[i] - 8, height: 10, align: c.align ?? 'left', lineBreak: false, ellipsis: true }); cx += widths[i]; });
    y += rh;
  });
  if (!r.rows.length) doc.fillColor('#64748B').font('Helvetica-Oblique').fontSize(9).text('Aucune donnée sur la période sélectionnée.', left, y + 10);
  // pagination
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    doc.page.margins.bottom = 0; // le pied de page est dans la marge : sans cela PDFKit crée une page supplémentaire
    doc.fillColor('#94A3B8').font('Helvetica').fontSize(7.5)
      .text(`${company?.name ?? ''} — ${r.title} — document confidentiel (données personnelles)`, left, doc.page.height - 30, { width: W / 1.5, lineBreak: false })
      .text(`Page ${i + 1} / ${range.count}`, left, doc.page.height - 30, { width: W, align: 'right', lineBreak: false });
  }
  doc.end();
}

router.get('/:type', ah(async (req, res) => {
  const q = parse(Q, req.query);
  const company = await getCompany();
  const tz = company?.timezone ?? 'Africa/Abidjan';
  const today = localDate(new Date(), tz);
  const type = String(req.params.type);
  let from = q.from ?? q.date, to = q.to ?? q.date;
  if (!from) {
    if (type === 'daily') from = today;
    else if (type === 'weekly') from = DateTime.fromISO(today).startOf('week').toISODate()!;
    else from = DateTime.fromISO(today).startOf('month').toISODate()!;
  }
  if (!to) to = type === 'daily' ? from : type === 'weekly' ? addDays(from, 6) : DateTime.fromISO(from).endOf('month').toISODate()!;
  if (to < from) throw badRequest('DATES', 'La date de fin précède la date de début.');
  if (DateTime.fromISO(to).diff(DateTime.fromISO(from), 'days').days > 400) throw badRequest('PERIOD', 'Période limitée à 13 mois.');
  const report = await build(type, req, { ...q, from, to }, tz);
  if (q.format === 'json') return res.json(report);
  await audit(req, `EXPORT_REPORT_${q.format.toUpperCase()}`, { entity: 'report', entityId: type, after: { from, to, employeeId: q.employeeId, departmentId: q.departmentId, rows: report.rows.length } });
  const name = `rapport-${type}-${from}${to !== from ? `_${to}` : ''}.${q.format}`;
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  if (q.format === 'xlsx') return toXlsx(report, res, company);
  if (q.format === 'csv') return toCsv(report, res);
  return toPdf(report, res, company);
}));
