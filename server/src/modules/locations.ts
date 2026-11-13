import { Router } from 'express';
import { z } from 'zod';
import QRCode from 'qrcode';
import PDFDocument from 'pdfkit';
import rateLimit from 'express-rate-limit';
import crypto from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { ah, parse, zId } from '../utils/http.js';
import { badRequest, conflict, notFound, forbidden } from '../utils/errors.js';
import { requireAuth, requireRole } from '../middlewares/auth.js';
import { audit } from '../services/audit.js';
import { makeQrPayload, currentWindow, randomToken } from '../services/qr.js';
import { env } from '../config/env.js';
import { getCompany } from '../services/settings.js';
import { performClock, getClockStatus } from '../services/clock.js';

type Loc = typeof schema.locationQrCodes.$inferSelect;
export function payloadFor(loc: Loc, companyId: number, now = Date.now()) {
  const dyn = loc.mode === 'DYNAMIQUE';
  const w = dyn ? currentWindow(loc.rotationSeconds, now) : 0;
  const payload = makeQrPayload({ c: companyId, l: loc.id, t: loc.type, v: loc.secretVersion, m: dyn ? 'D' : 'S', w }, env.QR_SECRET);
  const expiresAt = dyn ? new Date((w + 1) * loc.rotationSeconds * 1000) : null;
  return { payload, expiresAt };
}
const displayUrl = (l: Loc) => `/borne/${encodeURIComponent(l.code)}?k=${l.displayKey}`;

export const router = Router();
router.use(requireAuth, requireRole('SUPER_ADMIN'));
const input = z.object({ code: z.string().trim().min(2).max(40).regex(/^[A-Z0-9_\-]+$/i).transform((s) => s.toUpperCase()), label: z.string().trim().min(2).max(120),
  type: z.enum(['ENTREE', 'SORTIE', 'MIXTE']), mode: z.enum(['DYNAMIQUE', 'STATIQUE']).default('DYNAMIQUE'), rotationSeconds: z.number().int().min(15).max(3600).default(30), active: z.boolean().default(true) });

router.get('/', ah(async (_req, res) => {
  const rows = await db.select().from(schema.locationQrCodes).orderBy(schema.locationQrCodes.code);
  res.json(rows.map((l) => ({ id: l.id, code: l.code, label: l.label, type: l.type, mode: l.mode, rotationSeconds: l.rotationSeconds, active: l.active, secretVersion: l.secretVersion, displayUrl: displayUrl(l) })));
}));
router.post('/', ah(async (req, res) => {
  const b = parse(input, req.body);
  const [dup] = await db.select().from(schema.locationQrCodes).where(eq(schema.locationQrCodes.code, b.code));
  if (dup) throw conflict('DUPLICATE', 'Ce code existe déjà.');
  const [l] = await db.insert(schema.locationQrCodes).values({ ...b, displayKey: randomToken(24) }).returning();
  await audit(req, 'LOCATION_CREATED', { entity: 'location', entityId: l.id, after: { ...b } });
  res.status(201).json(l);
}));
router.put('/:id', ah(async (req, res) => {
  const id = parse(zId, req.params.id);
  const b = parse(input.partial(), req.body);
  const [before] = await db.select().from(schema.locationQrCodes).where(eq(schema.locationQrCodes.id, id));
  if (!before) throw notFound();
  const [l] = await db.update(schema.locationQrCodes).set({ ...b, updatedAt: new Date() }).where(eq(schema.locationQrCodes.id, id)).returning();
  await audit(req, 'LOCATION_UPDATED', { entity: 'location', entityId: id, before: { ...before, displayKey: undefined }, after: b });
  res.json(l);
}));
router.post('/:id/rotate-secret', ah(async (req, res) => {
  const id = parse(zId, req.params.id);
  const [l] = await db.update(schema.locationQrCodes).set({ secretVersion: sql`${schema.locationQrCodes.secretVersion} + 1`, displayKey: randomToken(24), updatedAt: new Date() })
    .where(eq(schema.locationQrCodes.id, id)).returning();
  if (!l) throw notFound();
  await audit(req, 'LOCATION_SECRET_ROTATED', { entity: 'location', entityId: id });
  res.json({ ok: true, displayUrl: displayUrl(l) });
}));
router.get('/:id/print.pdf', ah(async (req, res) => {
  const id = parse(zId, req.params.id);
  const [l] = await db.select().from(schema.locationQrCodes).where(eq(schema.locationQrCodes.id, id));
  if (!l) throw notFound();
  if (l.mode !== 'STATIQUE') throw badRequest('DYNAMIC', "Un QR dynamique ne s'imprime pas : affichez la borne (écran ou tablette).");
  const company = await getCompany();
  const { payload } = payloadFor(l, company.id);
  const png = await QRCode.toBuffer(payload, { width: 900, margin: 1, errorCorrectionLevel: 'M' });
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  res.setHeader('Content-Type', 'application/pdf'); res.setHeader('Content-Disposition', `inline; filename="${l.code}.pdf"`);
  doc.pipe(res);
  doc.rect(0, 0, doc.page.width, 110).fill(l.type === 'SORTIE' ? '#DC2626' : '#2563EB');
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(40).text(l.type === 'SORTIE' ? 'SORTIE' : l.type === 'ENTREE' ? 'ENTRÉE' : 'POINTAGE', 0, 30, { align: 'center' });
  doc.fillColor('#111827').fontSize(16).text(company.name, 0, 140, { align: 'center' });
  doc.image(png, (doc.page.width - 380) / 2, 190, { width: 380 });
  doc.font('Helvetica').fontSize(13).fillColor('#64748B').text(`${l.label} — ouvrez l'application Pointage RH, puis scannez ce code.`, 60, 600, { align: 'center', width: doc.page.width - 120 });
  doc.fontSize(9).text(`Code ${l.code} · version ${l.secretVersion} · imprimé le ${new Date().toLocaleDateString('fr-FR')}`, 60, 760, { align: 'center', width: doc.page.width - 120 });
  await audit(req, 'LOCATION_PRINTED', { entity: 'location', entityId: id });
  doc.end();
}));

/* ---------------------------------------------------------------- Borne */
export const kioskRouter = Router();
const kioskLimiter = rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false });
/** Jeton courant affiché par la borne (protégé par la clé de borne, comparée en temps constant) */
kioskRouter.get('/:code/token', kioskLimiter, ah(async (req, res) => {
  const [l] = await db.select().from(schema.locationQrCodes).where(eq(schema.locationQrCodes.code, String(req.params.code).toUpperCase()));
  const k = Buffer.from(String(req.query.k ?? ''));
  if (!l || !l.active || k.length !== Buffer.from(l.displayKey).length || !crypto.timingSafeEqual(k, Buffer.from(l.displayKey))) throw forbidden('Borne non autorisée ou clé révoquée.');
  const company = await getCompany();
  const { payload, expiresAt } = payloadFor(l, company.id);
  res.set('Cache-Control', 'no-store');
  res.json({ payload, expiresAt, rotationSeconds: l.mode === 'DYNAMIQUE' ? l.rotationSeconds : null, label: l.label, type: l.type, mode: l.mode,
    companyName: company.name, logoUrl: company.logoPath ? `/uploads/${company.logoPath}` : null, serverTime: new Date(),
    png: await QRCode.toDataURL(payload, { width: 640, margin: 1, errorCorrectionLevel: 'M' }) });
}));

/** Pointage de secours par badge personnel, depuis un poste RH (employé sans téléphone, panne de téléphone…) */
kioskRouter.post('/badge', requireAuth, requireRole('SUPER_ADMIN', 'HR_ADMIN'), ah(async (req, res) => {
  const b = parse(z.object({ badgeToken: z.string().min(10).max(200), action: z.enum(['ARRIVEE', 'DEPART', 'PAUSE_DEBUT', 'PAUSE_FIN']), locationCode: z.string().min(2).max(40), idempotencyKey: z.string().min(8).max(80).optional() }), req.body);
  const token = b.badgeToken.startsWith('PRHB.') ? b.badgeToken.slice(5) : b.badgeToken;
  const [q] = await db.select().from(schema.employeeQrCodes).where(and(eq(schema.employeeQrCodes.token, token), eq(schema.employeeQrCodes.active, true)));
  if (!q) throw badRequest('QR_INVALID', 'Badge inconnu ou révoqué.');
  const [e] = await db.select().from(schema.employees).where(eq(schema.employees.id, q.employeeId));
  const r = await performClock({ employeeId: q.employeeId, action: b.action, locationCode: b.locationCode.toUpperCase(), idempotencyKey: b.idempotencyKey, source: 'BADGE_BORNE', req });
  await audit(req, 'BADGE_CLOCK', { entity: 'employee', entityId: q.employeeId, after: { action: b.action, location: b.locationCode } });
  res.json({ ok: true, employee: { id: e.id, fullName: `${e.firstNames} ${e.lastName}`, matricule: e.matricule }, message: r.message, warnings: (r as any).warnings ?? [], status: await getClockStatus(q.employeeId) });
}));
