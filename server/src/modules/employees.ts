import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import ExcelJS from 'exceljs';
import QRCode from 'qrcode';
import PDFDocument from 'pdfkit';
import { and, eq, ilike, or, sql, inArray, desc, gte, lte } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { ah, parse, zDate, zId, zReason, pageParams } from '../utils/http.js';
import { badRequest, conflict, notFound } from '../utils/errors.js';
import { requireRole, ADMINS, STAFF, departmentScope, assertCanAccessEmployee } from '../middlewares/auth.js';
import { audit } from '../services/audit.js';
import { employeeQuery, toEmployeeDto } from '../services/dto.js';
import { uploadImage, uploadXlsx, storeUpload } from '../services/files.js';
import { randomToken } from '../services/qr.js';
import { resolveSchedule } from '../services/schedule.js';
import { companyTz, getCompany } from '../services/settings.js';
import { localDate } from '../utils/time.js';
import { attendanceDto, attendanceSelect } from './attendance.js';

export const router = Router();

const CONTRACTS = ['CDI', 'CDD', 'STAGE', 'INTERIM', 'CONSULTANT', 'AUTRE'] as const;
const empInput = z.object({
  matricule: z.string().trim().min(1).max(30).transform((s) => s.toUpperCase()),
  lastName: z.string().trim().min(1).max(80), firstNames: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(160).optional().nullable().or(z.literal('').transform(() => null)),
  phone: z.string().trim().max(40).optional().nullable(), gender: z.enum(['M', 'F']).optional().nullable(),
  birthDate: zDate.optional().nullable(), departmentId: zId.optional().nullable(), positionId: zId.optional().nullable(),
  hireDate: zDate.optional().nullable(), contractType: z.enum(CONTRACTS).default('CDI'), managerId: zId.optional().nullable(),
});
const roleSchema = z.enum(['SUPER_ADMIN', 'HR_ADMIN', 'MANAGER', 'EMPLOYEE']);

export const genPassword = () => {
  // lisible, sans caractères ambigus ; 1 chiffre minimum garanti
  const a = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ'; const d = '23456789';
  const pick = (s: string) => s[crypto.randomInt(s.length)];
  return Array.from({ length: 7 }, () => pick(a)).join('') + pick(d) + pick(d) + pick(a);
};

async function ensureQr(employeeId: number, tx: any = db) {
  const [q] = await tx.select().from(schema.employeeQrCodes).where(and(eq(schema.employeeQrCodes.employeeId, employeeId), eq(schema.employeeQrCodes.active, true)));
  if (q) return q;
  const [n] = await tx.insert(schema.employeeQrCodes).values({ employeeId, token: randomToken() }).returning();
  return n;
}
export const badgePayload = (token: string) => `PRHB.${token}`;

/* ---------------------------------------------------------------- liste */
router.get('/', requireRole(...STAFF), ah(async (req, res) => {
  const q = parse(z.object({ q: z.string().max(100).optional(), departmentId: zId.optional(), status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).optional() }).passthrough(), req.query);
  const { page, pageSize, offset } = pageParams(req.query);
  const scope = departmentScope(req);
  const conds = [];
  if (scope === 'NONE') return res.json({ items: [], total: 0, page, pageSize });
  if (scope) conds.push(eq(schema.employees.departmentId, scope));
  if (q.departmentId) conds.push(eq(schema.employees.departmentId, q.departmentId));
  if (q.status) conds.push(eq(schema.employees.status, q.status));
  if (q.q) {
    const like = `%${q.q}%`;
    conds.push(or(ilike(schema.employees.lastName, like), ilike(schema.employees.firstNames, like), ilike(schema.employees.matricule, like), ilike(schema.employees.email, like),
      sql`(${schema.employees.firstNames} || ' ' || ${schema.employees.lastName}) ILIKE ${like}`));
  }
  const where = conds.length ? and(...conds) : undefined;
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(schema.employees).where(where);
  const rows = await employeeQuery().where(where).orderBy(schema.employees.lastName, schema.employees.firstNames).limit(pageSize).offset(offset);
  res.json({ items: rows.map(toEmployeeDto), total, page, pageSize });
}));

/* -------------------------------------------------------------- exports */
router.get('/export.xlsx', requireRole(...ADMINS), ah(async (req, res) => {
  const rows = (await employeeQuery().orderBy(schema.employees.lastName)).map(toEmployeeDto);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Employés');
  ws.columns = [
    { header: 'Matricule', key: 'matricule', width: 14 }, { header: 'Nom', key: 'lastName', width: 18 }, { header: 'Prénoms', key: 'firstNames', width: 22 },
    { header: 'Email', key: 'email', width: 28 }, { header: 'Téléphone', key: 'phone', width: 16 }, { header: 'Département', key: 'departmentName', width: 20 },
    { header: 'Poste', key: 'positionTitle', width: 22 }, { header: "Date d'embauche", key: 'hireDate', width: 14 }, { header: 'Contrat', key: 'contractType', width: 10 },
    { header: 'Statut', key: 'status', width: 10 }, { header: 'Responsable', key: 'managerName', width: 22 }, { header: 'Rôle', key: 'role', width: 12 },
  ];
  ws.addRows(rows);
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF111827' } };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.autoFilter = { from: 'A1', to: 'L1' };
  await audit(req, 'EXPORT_EMPLOYEES', { entity: 'employee', after: { count: rows.length } });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="employes.xlsx"');
  await wb.xlsx.write(res); res.end();
}));

const IMPORT_COLS = ['Matricule', 'Nom', 'Prénoms', 'Email', 'Téléphone', 'Sexe (M/F)', 'Date de naissance (AAAA-MM-JJ)', 'Code département', 'Poste', "Date d'embauche (AAAA-MM-JJ)", 'Contrat (CDI/CDD/STAGE/INTERIM/CONSULTANT/AUTRE)'];
router.get('/import-template.xlsx', requireRole(...ADMINS), ah(async (_req, res) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Employés');
  ws.addRow(IMPORT_COLS).font = { bold: true };
  ws.columns.forEach((c) => { c.width = 22; });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="modele-import-employes.xlsx"');
  await wb.xlsx.write(res); res.end();
}));

router.post('/import', requireRole(...ADMINS), uploadXlsx.single('file'), ah(async (req, res) => {
  if (!req.file) throw badRequest('FILE_REQUIRED', 'Fichier Excel manquant.');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(req.file.buffer as any);
  const ws = wb.worksheets[0];
  if (!ws) throw badRequest('EMPTY', 'Classeur vide.');
  const deps = await db.select().from(schema.departments);
  const positions = await db.select().from(schema.positions);
  const cell = (r: ExcelJS.Row, i: number) => {
    const v: any = r.getCell(i).value;
    if (v == null) return '';
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if (typeof v === 'object' && 'text' in v) return String(v.text).trim();
    if (typeof v === 'object' && 'result' in v) return String(v.result).trim();
    return String(v).trim();
  };
  let created = 0, skipped = 0; const errors: { row: number; message: string }[] = []; const passwords: { matricule: string; password: string }[] = [];
  for (let i = 2; i <= ws.rowCount; i++) {
    const r = ws.getRow(i);
    if (!cell(r, 1) && !cell(r, 2)) continue;
    try {
      const dep = cell(r, 8) ? deps.find((d) => d.code.toUpperCase() === cell(r, 8).toUpperCase()) : null;
      if (cell(r, 8) && !dep) throw new Error(`département « ${cell(r, 8)} » inconnu`);
      let pos = cell(r, 9) ? positions.find((p) => p.title.toLowerCase() === cell(r, 9).toLowerCase()) : null;
      if (cell(r, 9) && !pos) { [pos] = await db.insert(schema.positions).values({ title: cell(r, 9), departmentId: dep?.id ?? null }).returning(); positions.push(pos!); }
      const data = empInput.parse({
        matricule: cell(r, 1), lastName: cell(r, 2), firstNames: cell(r, 3), email: cell(r, 4) || null, phone: cell(r, 5) || null,
        gender: cell(r, 6) ? cell(r, 6).toUpperCase() : null, birthDate: cell(r, 7) || null, departmentId: dep?.id ?? null, positionId: pos?.id ?? null,
        hireDate: cell(r, 10) || null, contractType: (cell(r, 11) || 'CDI').toUpperCase(),
      });
      const [dup] = await db.select({ id: schema.employees.id }).from(schema.employees).where(or(eq(schema.employees.matricule, data.matricule), data.email ? eq(schema.employees.email, data.email) : sql`false`));
      if (dup) { skipped++; errors.push({ row: i, message: `matricule ou email déjà existant (${data.matricule}) — ignoré` }); continue; }
      const password = genPassword();
      await db.transaction(async (tx) => {
        const [e] = await tx.insert(schema.employees).values(data).returning();
        await tx.insert(schema.users).values({ employeeId: e.id, login: data.email || data.matricule, passwordHash: await bcrypt.hash(password, 10), role: 'EMPLOYEE' });
        await ensureQr(e.id, tx);
      });
      passwords.push({ matricule: data.matricule, password });
      created++;
    } catch (e: any) {
      errors.push({ row: i, message: e?.issues ? e.issues.map((x: any) => `${x.path.join('.')}: ${x.message}`).join(' ; ') : e.message });
    }
  }
  await audit(req, 'EMPLOYEES_IMPORTED', { entity: 'employee', after: { created, skipped, errors: errors.length } });
  res.json({ created, skipped, errors, initialPasswords: passwords });
}));

/* -------------------------------------------------------------- badges */
router.get('/badges.pdf', requireRole(...ADMINS), ah(async (req, res) => {
  const ids = String(req.query.ids || '').split(',').map(Number).filter((n) => n > 0);
  const rows = (await employeeQuery().where(ids.length ? inArray(schema.employees.id, ids) : eq(schema.employees.status, 'ACTIVE')).orderBy(schema.employees.lastName)).map(toEmployeeDto);
  const company = await getCompany();
  const doc = new PDFDocument({ size: 'A4', margin: 30 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline; filename="badges.pdf"');
  doc.pipe(res);
  const W = 255, H = 160, gap = 15;
  let idx = 0;
  for (const e of rows) {
    const q = await ensureQr(e.id);
    const png = await QRCode.toBuffer(badgePayload(q.token), { margin: 1, width: 240, errorCorrectionLevel: 'M' });
    const pos = idx % 8; if (idx > 0 && pos === 0) doc.addPage();
    const x = 30 + (pos % 2) * (W + gap); const y = 30 + Math.floor(pos / 2) * (H + gap);
    doc.roundedRect(x, y, W, H, 8).lineWidth(0.8).strokeColor('#CBD5E1').stroke();
    doc.rect(x, y, W, 26).fill('#111827');
    doc.fillColor('#FFFFFF').fontSize(10).font('Helvetica-Bold').text(company?.name ?? 'Entreprise', x + 10, y + 8, { width: W - 20 });
    doc.image(png, x + W - 118, y + 34, { width: 110 });
    doc.fillColor('#111827').fontSize(12).font('Helvetica-Bold').text(e.fullName, x + 10, y + 40, { width: W - 135 });
    doc.font('Helvetica').fontSize(9).fillColor('#64748B').text(e.positionTitle ?? '', x + 10, doc.y + 4, { width: W - 135 });
    doc.text(e.departmentName ?? '', { width: W - 135 });
    doc.fillColor('#2563EB').font('Helvetica-Bold').fontSize(10).text(`Matricule ${e.matricule}`, x + 10, y + H - 28);
    idx++;
  }
  if (!rows.length) doc.text('Aucun employé.');
  await audit(req, 'BADGES_PRINTED', { entity: 'employee', after: { count: rows.length } });
  doc.end();
}));

/* --------------------------------------------------------------- fiche */
router.get('/:id', requireRole(...STAFF), ah(async (req, res) => {
  const id = parse(zId, req.params.id);
  await assertCanAccessEmployee(req, id);
  const [r] = await employeeQuery().where(eq(schema.employees.id, id));
  if (!r) throw notFound('Employé introuvable');
  const today = localDate(new Date(), await companyTz());
  const s = await resolveSchedule(id, today);
  res.json({ ...toEmployeeDto(r), schedule: s ? { id: s.scheduleId, name: s.scheduleName, source: s.source, version: s.version } : null });
}));

router.get('/:id/attendance', requireRole(...STAFF), ah(async (req, res) => {
  const id = parse(zId, req.params.id);
  await assertCanAccessEmployee(req, id);
  const q = parse(z.object({ from: zDate.optional(), to: zDate.optional() }), req.query);
  const conds = [eq(schema.attendances.employeeId, id)];
  if (q.from) conds.push(gte(schema.attendances.workDate, q.from));
  if (q.to) conds.push(lte(schema.attendances.workDate, q.to));
  const rows = await attendanceSelect().where(and(...conds)).orderBy(desc(schema.attendances.workDate)).limit(400);
  res.json(rows.map(attendanceDto));
}));

/* --------------------------------------------------------------- CRUD */
async function checkUnique(data: { matricule?: string; email?: string | null }, exceptId?: number) {
  if (data.matricule) {
    const [d] = await db.select({ id: schema.employees.id }).from(schema.employees).where(eq(schema.employees.matricule, data.matricule));
    if (d && d.id !== exceptId) throw conflict('DUPLICATE_MATRICULE', 'Ce matricule est déjà attribué.');
  }
  if (data.email) {
    const [d] = await db.select({ id: schema.employees.id }).from(schema.employees).where(sql`lower(${schema.employees.email}) = lower(${data.email})`);
    if (d && d.id !== exceptId) throw conflict('DUPLICATE_EMAIL', 'Cet email est déjà utilisé.');
  }
}

router.post('/', requireRole(...ADMINS), ah(async (req, res) => {
  const body = parse(empInput.extend({ role: roleSchema.default('EMPLOYEE'), password: z.string().min(8).max(128).optional() }), req.body);
  const { role, password: pw, ...data } = body;
  if (role === 'SUPER_ADMIN' && req.user!.role !== 'SUPER_ADMIN') throw badRequest('ROLE', 'Seul un super administrateur peut créer ce rôle.');
  if (role === 'HR_ADMIN' && req.user!.role !== 'SUPER_ADMIN') throw badRequest('ROLE', 'Seul un super administrateur peut créer un administrateur RH.');
  await checkUnique(data);
  const initialPassword = pw ?? genPassword();
  const login = data.email || data.matricule;
  const [u] = await db.select().from(schema.users).where(sql`lower(${schema.users.login}) = lower(${login})`);
  if (u) throw conflict('DUPLICATE_LOGIN', 'Un compte utilise déjà cet identifiant.');
  const employee = await db.transaction(async (tx) => {
    const [e] = await tx.insert(schema.employees).values(data).returning();
    await tx.insert(schema.users).values({ employeeId: e.id, login, passwordHash: await bcrypt.hash(initialPassword, 12), role, mustChangePassword: true });
    await ensureQr(e.id, tx);
    await audit(req, 'EMPLOYEE_CREATED', { entity: 'employee', entityId: e.id, after: { ...data, role } }, tx);
    return e;
  });
  const [r] = await employeeQuery().where(eq(schema.employees.id, employee.id));
  res.status(201).json({ employee: toEmployeeDto(r), initialPassword, login });
}));

router.put('/:id', requireRole(...ADMINS), ah(async (req, res) => {
  const id = parse(zId, req.params.id);
  const data = parse(empInput.partial().extend({ role: roleSchema.optional() }), req.body);
  const [before] = await db.select().from(schema.employees).where(eq(schema.employees.id, id));
  if (!before) throw notFound('Employé introuvable');
  if (data.managerId === id) throw badRequest('MANAGER_SELF', 'Un employé ne peut pas être son propre responsable.');
  await checkUnique(data, id);
  const { role, ...fields } = data;
  await db.transaction(async (tx) => {
    if (Object.keys(fields).length) await tx.update(schema.employees).set({ ...fields, updatedAt: new Date() }).where(eq(schema.employees.id, id));
    if (role) {
      if ((role === 'SUPER_ADMIN' || role === 'HR_ADMIN') && req.user!.role !== 'SUPER_ADMIN') throw badRequest('ROLE', 'Seul un super administrateur peut attribuer ce rôle.');
      const [cur] = await tx.select().from(schema.users).where(eq(schema.users.employeeId, id));
      if (cur?.role === 'SUPER_ADMIN' && req.user!.role !== 'SUPER_ADMIN') throw badRequest('ROLE', 'Modification interdite.');
      await tx.update(schema.users).set({ role, updatedAt: new Date() }).where(eq(schema.users.employeeId, id));
    }
    await audit(req, 'EMPLOYEE_UPDATED', { entity: 'employee', entityId: id, before, after: data }, tx);
  });
  const [r] = await employeeQuery().where(eq(schema.employees.id, id));
  res.json(toEmployeeDto(r));
}));

for (const action of ['deactivate', 'reactivate'] as const) {
  router.post(`/:id/${action}`, requireRole(...ADMINS), ah(async (req, res) => {
    const id = parse(zId, req.params.id);
    const { reason } = parse(z.object({ reason: zReason }), req.body);
    const [e] = await db.select().from(schema.employees).where(eq(schema.employees.id, id));
    if (!e) throw notFound();
    if (action === 'deactivate' && e.id === req.user!.employeeId) throw badRequest('SELF', 'Vous ne pouvez pas désactiver votre propre compte.');
    const status = action === 'deactivate' ? 'INACTIVE' : 'ACTIVE';
    await db.transaction(async (tx) => {
      await tx.update(schema.employees).set({ status, updatedAt: new Date() }).where(eq(schema.employees.id, id));
      await tx.update(schema.users).set({ active: status === 'ACTIVE' }).where(eq(schema.users.employeeId, id));
      if (status === 'INACTIVE') {
        const us = await tx.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.employeeId, id));
        if (us[0]) await tx.update(schema.sessions).set({ revokedAt: new Date() }).where(eq(schema.sessions.userId, us[0].id));
      }
      await audit(req, action === 'deactivate' ? 'EMPLOYEE_DEACTIVATED' : 'EMPLOYEE_REACTIVATED', { entity: 'employee', entityId: id, reason, before: { status: e.status }, after: { status } }, tx);
    });
    res.json({ ok: true, status });
  }));
}

router.post('/:id/reset-password', requireRole(...ADMINS), ah(async (req, res) => {
  const id = parse(zId, req.params.id);
  const [u] = await db.select().from(schema.users).where(eq(schema.users.employeeId, id));
  if (!u) throw notFound('Compte introuvable');
  if (u.role === 'SUPER_ADMIN' && req.user!.role !== 'SUPER_ADMIN') throw badRequest('ROLE', 'Réinitialisation interdite.');
  const temporaryPassword = genPassword();
  await db.update(schema.users).set({ passwordHash: await bcrypt.hash(temporaryPassword, 12), mustChangePassword: true, failedAttempts: 0, lockedUntil: null }).where(eq(schema.users.id, u.id));
  await db.update(schema.sessions).set({ revokedAt: new Date() }).where(eq(schema.sessions.userId, u.id));
  await audit(req, 'PASSWORD_RESET', { entity: 'user', entityId: u.id });
  res.json({ temporaryPassword, login: u.login });
}));

router.post('/:id/photo', requireRole(...ADMINS), uploadImage.single('file'), ah(async (req, res) => {
  const id = parse(zId, req.params.id);
  if (!req.file) throw badRequest('FILE_REQUIRED', 'Fichier manquant.');
  const p = await storeUpload(req.file, 'photos');
  await db.update(schema.employees).set({ photoPath: p, updatedAt: new Date() }).where(eq(schema.employees.id, id));
  await audit(req, 'EMPLOYEE_PHOTO_UPDATED', { entity: 'employee', entityId: id });
  res.json({ photoUrl: `/uploads/${p}` });
}));

router.get('/:id/qrcode', requireRole(...ADMINS), ah(async (req, res) => {
  const id = parse(zId, req.params.id);
  const q = await ensureQr(id);
  res.json({ token: badgePayload(q.token), png: await QRCode.toDataURL(badgePayload(q.token), { margin: 1, width: 320 }) });
}));
router.post('/:id/qrcode/regenerate', requireRole(...ADMINS), ah(async (req, res) => {
  const id = parse(zId, req.params.id);
  await db.update(schema.employeeQrCodes).set({ active: false, revokedAt: new Date() }).where(and(eq(schema.employeeQrCodes.employeeId, id), eq(schema.employeeQrCodes.active, true)));
  const q = await ensureQr(id);
  await audit(req, 'EMPLOYEE_QR_REGENERATED', { entity: 'employee', entityId: id });
  res.json({ token: badgePayload(q.token), png: await QRCode.toDataURL(badgePayload(q.token), { margin: 1, width: 320 }) });
}));

export { ensureQr };
