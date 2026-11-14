/**
 * Cœur du pointage. Ordre des contrôles :
 *  limitation des tentatives → idempotence → système activé → employé actif → réseau autorisé
 *  → QR signé/valide/non expiré/bon établissement/bon type → résolution de la journée
 *  → transaction avec verrou de ligne (anti-doublon concurrent) → machine à états → enregistrement
 *  → recalcul → détection d'anomalies → notifications.
 * L'heure de référence est TOUJOURS celle du serveur.
 */
import net from 'node:net';
import type { Request } from 'express';
import { and, eq, gte, sql, isNull, desc } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { AppError } from '../utils/errors.js';
import { getCompany, getSettings } from './settings.js';
import { verifyQrPayload, locationAllows, type QrBody } from './qr.js';
import { env } from '../config/env.js';
import { transition, allowedActions, type Action, type State } from './stateMachine.js';
import { lockAttendance, recomputeAttendance, raiseAnomaly, resolveWorkDate } from './attendance.js';
import { shiftBounds, isScheduledWorkDay } from './calc.js';
import { toRules } from './schedule.js';
import { loadHolidays, loadApprovedLeaves } from './dayContext.js';
import { notifyEmployee, managerUserIdsFor, notifyUsers } from './notify.js';
import { fmtTime, localDate } from '../utils/time.js';

/* ---------------------------------------------------------- réseau autorisé */
export function ipAllowed(ip: string | undefined, cidrs: string[]) {
  if (!ip) return false;
  const clean = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  const fam = net.isIP(clean);
  if (!fam) return false;
  const bl = new net.BlockList();
  for (const c of cidrs) {
    const [addr, bits] = c.split('/');
    const f = net.isIP(addr);
    if (!f) continue;
    try { bl.addSubnet(addr, Number(bits), f === 4 ? 'ipv4' : 'ipv6'); } catch { /* ignoré */ }
  }
  return bl.check(clean, fam === 4 ? 'ipv4' : 'ipv6');
}

/* ------------------------------------------------- limitation par employé */
const attempts = new Map<number, number[]>();
function rateLimited(employeeId: number, max: number) {
  const now = Date.now();
  const arr = (attempts.get(employeeId) ?? []).filter((t) => now - t < 60_000);
  arr.push(now); attempts.set(employeeId, arr);
  return arr.length > max;
}
export const resetClockRateLimit = () => attempts.clear();

export class ClockError extends AppError {
  constructor(status: number, code: string, message: string, details?: unknown, public locationId?: number | null, public workDate?: string | null, public attendanceId?: number | null) {
    super(status, code, message, details);
  }
}

export interface ClockInput {
  employeeId: number; action: Action; qrPayload?: string; locationCode?: string; idempotencyKey?: string;
  clientTime?: string; source: 'QR_MOBILE' | 'BADGE_BORNE'; req: Request;
}

async function resolveLocation(input: ClockInput, companyId: number) {
  if (input.source === 'BADGE_BORNE') {
    const [loc] = await db.select().from(schema.locationQrCodes).where(eq(schema.locationQrCodes.code, input.locationCode ?? ''));
    if (!loc || !loc.active) throw new ClockError(400, 'QR_INVALID', 'Point de pointage inconnu ou inactif.');
    if (!locationAllows(loc.type, input.action)) throw new ClockError(400, 'QR_WRONG_TYPE', wrongTypeMsg(input.action), undefined, loc.id);
    return loc;
  }
  const locs = await db.select().from(schema.locationQrCodes);
  const check = verifyQrPayload(input.qrPayload ?? '', env.QR_SECRET, (b: QrBody) => locs.find((l) => l.id === b.l)?.rotationSeconds ?? 30);
  if (!check.ok) throw new ClockError(400, check.code, check.message);
  const b = check.body;
  if (b.c !== companyId) throw new ClockError(400, 'QR_WRONG_COMPANY', 'Ce QR Code appartient à un autre établissement.');
  const loc = locs.find((l) => l.id === b.l);
  if (!loc || !loc.active || loc.secretVersion !== b.v) throw new ClockError(400, 'QR_INVALID', "Ce QR Code n'est plus valide (révoqué ou désactivé).");
  if ((loc.mode === 'DYNAMIQUE') !== (b.m === 'D')) throw new ClockError(400, 'QR_INVALID', "Ce QR Code n'est plus valide pour ce point de pointage.");
  if (!locationAllows(loc.type, input.action)) throw new ClockError(400, 'QR_WRONG_TYPE', wrongTypeMsg(input.action), undefined, loc.id);
  return loc;
}
const wrongTypeMsg = (a: Action) => a === 'ARRIVEE' || a === 'PAUSE_FIN'
  ? "Ce QR Code est celui de la SORTIE. Scannez le QR Code d'ENTRÉE pour pointer votre arrivée."
  : "Ce QR Code est celui de l'ENTRÉE. Scannez le QR Code de SORTIE pour pointer votre départ.";

const ACTION_LABEL: Record<Action, string> = { ARRIVEE: 'Arrivée', DEPART: 'Départ', PAUSE_DEBUT: 'Début de pause', PAUSE_FIN: 'Fin de pause' };
/** Accord du participe : « Arrivée enregistrée », « Départ enregistré » */
const DONE: Record<Action, string> = { ARRIVEE: 'Arrivée enregistrée', DEPART: 'Départ enregistré', PAUSE_DEBUT: 'Début de pause enregistré', PAUSE_FIN: 'Fin de pause enregistrée' };

export async function performClock(input: ClockInput) {
  const { req, employeeId, action } = input;
  const settings = await getSettings();
  const meta = { ip: req.ip ?? null, userAgent: req.get('user-agent') ?? null, sessionId: req.user?.sessionId ?? null,
    deviceId: (req.get('x-device-id') || '').slice(0, 64) || null, clientTime: input.clientTime ? new Date(input.clientTime) : null };
  if (meta.clientTime && isNaN(meta.clientTime.getTime())) meta.clientTime = null;

  // Idempotence : un même scan rejoué (double clic, renvoi réseau) renvoie le résultat initial sans rien créer
  if (input.idempotencyKey) {
    const [prev] = await db.select().from(schema.attendanceEvents)
      .where(and(eq(schema.attendanceEvents.employeeId, employeeId), eq(schema.attendanceEvents.idempotencyKey, input.idempotencyKey)));
    if (prev) {
      if (prev.result === 'ACCEPTE') return { replay: true, event: prev, message: `${DONE[prev.type].replace('enregistr', 'déjà enregistr')} à ${fmtTime(prev.serverTime, (await getCompany()).timezone)}.` };
      throw new ClockError(409, prev.reasonCode ?? 'TRANSITION_INVALIDE', prev.reasonMessage ?? 'Pointage déjà refusé.');
    }
  }

  let locationId: number | null = null, workDate: string | null = null, attendanceId: number | null = null;
  try {
    if (rateLimited(employeeId, settings.clocking.maxAttemptsPerMinute)) {
      throw new ClockError(429, 'TOO_MANY_ATTEMPTS', 'Trop de tentatives de pointage. Patientez une minute avant de réessayer.');
    }
    const company = await getCompany();
    if (!company?.clockingEnabled) throw new ClockError(403, 'CLOCKING_DISABLED', "Le pointage n'est pas encore activé par l'administrateur.");
    const [emp] = await db.select().from(schema.employees).where(eq(schema.employees.id, employeeId));
    if (!emp || emp.status !== 'ACTIVE') throw new ClockError(403, 'EMPLOYEE_INACTIVE', 'Votre compte employé est désactivé : pointage impossible.');
    if (settings.clocking.enforceNetwork && !ipAllowed(req.ip, settings.clocking.allowedNetworks)) {
      throw new ClockError(403, 'NETWORK_NOT_ALLOWED', "Pointage refusé : vous devez être connecté au réseau Wi-Fi de l'entreprise.", { ip: req.ip });
    }
    const loc = await resolveLocation(input, company.id);
    locationId = loc.id;

    const now = new Date(); // heure serveur = référence unique
    const tz = company.timezone;
    const wd = await resolveWorkDate(db, emp, now, tz);
    workDate = wd.workDate;
    const version = wd.resolved?.version ?? null;

    const result = await db.transaction(async (tx) => {
      const att = await lockAttendance(tx, emp.id, wd.workDate, version?.id ?? null);
      attendanceId = att.id;
      // la version d'horaire est figée à la création de la journée
      const [v] = att.scheduleVersionId ? await tx.select().from(schema.scheduleVersions).where(eq(schema.scheduleVersions.id, att.scheduleVersionId)) : [null];
      const ctx = { breakTracking: !!v?.breakTracking, maxBreaks: v?.maxBreaks ?? 0, breakCount: att.breakCount };
      if (att.isClosed && !att.arrivalAt && action === 'ARRIVEE' && !att.corrected) {
        throw new ClockError(409, 'TRANSITION_INVALIDE', 'Cette journée est déjà clôturée. Contactez les RH pour une régularisation.');
      }
      const t = transition(att.state as State, action, ctx);
      if (!t.ok) {
        const existing = t.code === 'DOUBLE_ARRIVEE' || t.code === 'ARRIVEE_APRES_DEPART' ? att.arrivalAt : t.code === 'DOUBLE_DEPART' ? att.departureAt : null;
        const msg = existing ? `${t.message} (enregistré à ${fmtTime(existing, tz)})` : t.message;
        throw new ClockError(409, t.code, msg, existing ? { existingTime: existing.toISOString() } : undefined, loc.id, wd.workDate, att.id);
      }
      const patch: Partial<typeof schema.attendances.$inferInsert> = { state: t.next, updatedAt: now };
      if (action === 'ARRIVEE') patch.arrivalAt = now;
      if (action === 'DEPART') patch.departureAt = now;
      if (action === 'PAUSE_DEBUT') {
        await tx.insert(schema.attendanceBreaks).values({ attendanceId: att.id, startAt: now });
        patch.breakCount = att.breakCount + 1;
      }
      if (action === 'PAUSE_FIN') {
        const [open] = await tx.select().from(schema.attendanceBreaks).where(and(eq(schema.attendanceBreaks.attendanceId, att.id), isNull(schema.attendanceBreaks.endAt))).orderBy(desc(schema.attendanceBreaks.id)).limit(1);
        if (open) await tx.update(schema.attendanceBreaks).set({ endAt: now }).where(eq(schema.attendanceBreaks.id, open.id));
      }
      await tx.update(schema.attendances).set(patch).where(eq(schema.attendances.id, att.id));
      const [event] = await tx.insert(schema.attendanceEvents).values({
        attendanceId: att.id, employeeId: emp.id, workDate: wd.workDate, type: action, serverTime: now, source: input.source,
        locationQrId: loc.id, result: 'ACCEPTE', idempotencyKey: input.idempotencyKey ?? null, createdBy: req.user?.id ?? null, ...meta,
        meta: { schedule: wd.resolved?.scheduleName ?? null, source: wd.resolved?.source ?? null },
      }).returning();
      const rc = await recomputeAttendance(tx, att.id);

      // ---- détection d'anomalies au fil de l'eau
      const warnings: string[] = [];
      const holidays = await loadHolidays(tx);
      const leaves = await loadApprovedLeaves(wd.workDate, wd.workDate, [emp.id], tx);
      const holiday = holidays.label(wd.workDate);
      const leave = leaves.get(emp.id, wd.workDate);
      if (action === 'ARRIVEE') {
        if (holiday || leave || (v && !isScheduledWorkDay(wd.workDate, toRules(v)))) {
          const why = holiday ? `jour férié (${holiday})` : leave ? `congé approuvé (${leave.label})` : 'jour non travaillé';
          warnings.push(`Pointage enregistré un ${why} : il sera examiné par les RH.`);
          await raiseAnomaly(tx, { employeeId: emp.id, attendanceId: att.id, workDate: wd.workDate, type: 'JOUR_NON_TRAVAILLE', severity: leave ? 'MOYENNE' : 'FAIBLE', message: `Pointage un ${why}.` });
        }
        if (v) {
          const b = shiftBounds(wd.workDate, toRules(v), tz);
          if (now.getTime() < b.start.getTime() - v.arrivalWindowBeforeMin * 60_000 || now > b.end) {
            await raiseAnomaly(tx, { employeeId: emp.id, attendanceId: att.id, workDate: wd.workDate, type: 'HORS_HORAIRE', severity: 'FAIBLE', message: `Arrivée hors de la plage horaire prévue (${fmtTime(now, tz)}).` });
          }
        }
        if (rc && rc.attendance.lateMinutes > 0) {
          warnings.push(`Retard enregistré : ${rc.attendance.lateMinutes} min.`);
          await notifyEmployee(emp.id, { type: 'RETARD', title: 'Retard détecté', body: `Arrivée à ${fmtTime(now, tz)} — retard retenu de ${rc.attendance.lateMinutes} min.`, link: '/app/history' }, tx);
          const mgrs = await managerUserIdsFor(emp.id, tx);
          await notifyUsers(mgrs, { type: 'RETARD', title: `Retard : ${emp.firstNames} ${emp.lastName}`, body: `Arrivée à ${fmtTime(now, tz)} (${rc.attendance.lateMinutes} min retenues).`, link: '/admin/live' }, tx);
        }
      }
      if (action === 'DEPART' && v && rc) {
        const b = shiftBounds(wd.workDate, toRules(v), tz);
        if (now.getTime() > b.end.getTime() + settings.anomalies.offHoursMarginMin * 60_000) {
          await raiseAnomaly(tx, { employeeId: emp.id, attendanceId: att.id, workDate: wd.workDate, type: 'DEPASSEMENT_HORAIRE', severity: 'FAIBLE', message: `Départ très tardif (${fmtTime(now, tz)}).` });
        }
        if (rc.attendance.earlyLeaveMinutes > 0) warnings.push(`Départ anticipé : ${rc.attendance.earlyLeaveMinutes} min avant la fin prévue.`);
      }
      await notifyEmployee(emp.id, { type: 'POINTAGE', title: DONE[action], body: `${ACTION_LABEL[action]} à ${fmtTime(now, tz)} (${loc.label}).` }, tx);
      return { event, warnings };
    });
    return {
      replay: false, event: result.event, warnings: result.warnings,
      message: `${DONE[action]} à ${fmtTime(result.event.serverTime, (await getCompany()).timezone)}.`,
    };
  } catch (e: any) {
    // Course entre deux requêtes portant la même clé d'idempotence ou contrainte d'unicité : aucune donnée en double
    if (e?.code === '23505') {
      const err = new ClockError(409, action === 'DEPART' ? 'DOUBLE_DEPART' : 'DOUBLE_ARRIVEE', 'Pointage déjà enregistré (requête en double ignorée).');
      await logRefusal(input, err, locationId, workDate, attendanceId, meta, settings, true);
      throw err;
    }
    if (e instanceof ClockError) {
      await logRefusal(input, e, e.locationId ?? locationId, e.workDate ?? workDate, e.attendanceId ?? attendanceId, meta, settings);
    }
    throw e;
  }
}

async function logRefusal(input: ClockInput, e: ClockError, locationId: number | null, workDate: string | null, attendanceId: number | null, meta: any, settings: any, skipIdem = false) {
  const company = await getCompany();
  const tz = company?.timezone ?? 'Africa/Abidjan';
  const wd = workDate ?? localDate(new Date(), tz);
  try {
    await db.insert(schema.attendanceEvents).values({
      attendanceId, employeeId: input.employeeId, workDate: wd, type: input.action, source: input.source, locationQrId: locationId,
      result: 'REFUSE', reasonCode: e.code, reasonMessage: e.message, idempotencyKey: skipIdem ? null : input.idempotencyKey ?? null, ...meta,
    });
  } catch { /* la journalisation ne doit pas masquer l'erreur métier */ }
  try {
    // doubles pointages « réels » (pas un double clic immédiat) et tentatives répétées → anomalies
    if ((e.code === 'DOUBLE_ARRIVEE' || e.code === 'DOUBLE_DEPART') && attendanceId) {
      const [att] = await db.select().from(schema.attendances).where(eq(schema.attendances.id, attendanceId));
      const ref = e.code === 'DOUBLE_ARRIVEE' ? att?.arrivalAt : att?.departureAt;
      if (ref && Date.now() - ref.getTime() > 120_000) {
        await raiseAnomaly(db, { employeeId: input.employeeId, attendanceId, workDate: wd, type: e.code, severity: 'FAIBLE', message: e.message });
      }
    }
    if (e.code === 'DEPART_SANS_ARRIVEE') {
      await raiseAnomaly(db, { employeeId: input.employeeId, attendanceId, workDate: wd, type: 'DEPART_SANS_ARRIVEE', severity: 'MOYENNE', message: 'Tentative de départ sans arrivée enregistrée.' });
    }
    if (e.code === 'NETWORK_NOT_ALLOWED') {
      await raiseAnomaly(db, { employeeId: input.employeeId, workDate: wd, type: 'HORS_RESEAU', severity: 'MOYENNE', message: `Tentative de pointage hors du réseau autorisé (IP ${meta.ip}).` });
    }
    if (e.code === 'QR_INVALID' || e.code === 'QR_WRONG_COMPANY') {
      await raiseAnomaly(db, { employeeId: input.employeeId, workDate: wd, type: 'QR_INVALIDE', severity: 'MOYENNE', message: 'Présentation d\'un QR Code invalide ou falsifié.' });
    }
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.attendanceEvents)
      .where(and(eq(schema.attendanceEvents.employeeId, input.employeeId), eq(schema.attendanceEvents.result, 'REFUSE'), gte(schema.attendanceEvents.serverTime, new Date(Date.now() - 24 * 3600_000))));
    if (n >= settings.clocking.repeatedRefusalThreshold) {
      await raiseAnomaly(db, { employeeId: input.employeeId, attendanceId, workDate: wd, type: 'TENTATIVES_REPETEES', severity: 'ELEVEE', message: `${n} tentatives de pointage refusées en 24 h.` });
    }
  } catch { /* idem */ }
}

/** État courant de pointage de l'employé (écran d'accueil mobile) */
export async function getClockStatus(employeeId: number) {
  const company = await getCompany();
  const tz = company?.timezone ?? 'Africa/Abidjan';
  const [emp] = await db.select().from(schema.employees).where(eq(schema.employees.id, employeeId));
  const wd = await resolveWorkDate(db, emp, new Date(), tz);
  const [att] = await db.select().from(schema.attendances).where(and(eq(schema.attendances.employeeId, employeeId), eq(schema.attendances.workDate, wd.workDate)));
  const vId = att?.scheduleVersionId ?? wd.resolved?.version.id;
  const [v] = vId ? await db.select().from(schema.scheduleVersions).where(eq(schema.scheduleVersions.id, vId)) : [null];
  const breaks = att ? await db.select().from(schema.attendanceBreaks).where(eq(schema.attendanceBreaks.attendanceId, att.id)).orderBy(schema.attendanceBreaks.startAt) : [];
  const holidays = await loadHolidays();
  const leaves = await loadApprovedLeaves(wd.workDate, wd.workDate, [employeeId]);
  const leave = leaves.get(employeeId, wd.workDate);
  const state = (att?.state ?? 'NON_POINTE') as State;
  const ctx = { breakTracking: !!v?.breakTracking, maxBreaks: v?.maxBreaks ?? 0, breakCount: att?.breakCount ?? 0 };
  return {
    workDate: wd.workDate, state, dayStatus: att?.dayStatus ?? 'EN_COURS', arrivalAt: att?.arrivalAt ?? null, departureAt: att?.departureAt ?? null,
    breaks: breaks.map((b) => ({ startAt: b.startAt, endAt: b.endAt })), breakTracking: ctx.breakTracking, maxBreaks: ctx.maxBreaks,
    allowedActions: company?.clockingEnabled && !(att?.isClosed && !att?.corrected && state !== 'PARTI') ? allowedActions(state, ctx) : [],
    schedule: v ? { name: wd.resolved?.scheduleName ?? '', startTime: v.startTime, endTime: v.endTime, breakStart: v.breakStart, breakEnd: v.breakEnd, lateToleranceMin: v.lateToleranceMin } : null,
    isWorkingDay: v ? isScheduledWorkDay(wd.workDate, toRules(v)) && !holidays.label(wd.workDate) && !leave : false,
    holiday: holidays.label(wd.workDate), leave: leave ? { type: leave.code, label: leave.label } : null,
    lateMinutes: att?.lateMinutes ?? 0, workedMinutes: att?.workedMinutes ?? 0, clockingEnabled: !!company?.clockingEnabled,
  };
}
