/**
 * Moteur de calcul RH — fonctions PURES (aucun accès base), couvertes par tests unitaires.
 * Toutes les durées sont en minutes. La présence n'est PAS le travail effectif.
 */
import { atLocal, isoWeekday, minutesBetween } from '../utils/time.js';

export interface ScheduleRules {
  startTime: string; endTime: string;
  breakStart?: string | null; breakEnd?: string | null;
  workDays: number[]; dailyMinutes: number;
  lateToleranceMin: number; earlyLeaveToleranceMin: number; overtimeThresholdMin: number;
  breakTracking: boolean; maxBreaks: number; arrivalWindowBeforeMin: number;
}

export interface DayContext {
  isHoliday?: boolean;
  onLeave?: boolean; // congé / permission / mission approuvé couvrant la journée
}

export interface Interval { start: Date; end: Date | null }

export interface DayComputation {
  isWorkingDay: boolean;
  expectedMinutes: number;
  lateRawMinutes: number;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  presenceMinutes: number;
  breakMinutes: number;
  workedMinutes: number;
  normalMinutes: number;
  overtimePotentialMinutes: number;
}

const toMin = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

/** Bornes théoriques de la journée (gère les horaires traversant minuit) */
export function shiftBounds(workDate: string, r: ScheduleRules, tz: string) {
  const crosses = toMin(r.endTime) <= toMin(r.startTime);
  const start = atLocal(workDate, r.startTime, tz);
  const end = atLocal(workDate, r.endTime, tz, crosses ? 1 : 0);
  let breakInterval: { start: Date; end: Date } | null = null;
  if (r.breakStart && r.breakEnd) {
    const bsOff = crosses && toMin(r.breakStart) < toMin(r.startTime) ? 1 : 0;
    const bs = atLocal(workDate, r.breakStart, tz, bsOff);
    const beOff = toMin(r.breakEnd) <= toMin(r.breakStart) ? bsOff + 1 : bsOff;
    const be = atLocal(workDate, r.breakEnd, tz, beOff);
    breakInterval = { start: bs, end: be };
  }
  return { start, end, crossesMidnight: crosses, breakInterval };
}

export function isScheduledWorkDay(workDate: string, r: ScheduleRules) {
  return r.workDays.includes(isoWeekday(workDate));
}

/** Durée prévue de la pause planifiée (minutes) */
export function scheduledBreakMinutes(r: ScheduleRules) {
  if (!r.breakStart || !r.breakEnd) return 0;
  let d = toMin(r.breakEnd) - toMin(r.breakStart);
  if (d < 0) d += 1440;
  return d;
}

function overlap(a1: Date, a2: Date, b1: Date, b2: Date) {
  const s = Math.max(a1.getTime(), b1.getTime());
  const e = Math.min(a2.getTime(), b2.getTime());
  return e > s ? Math.round((e - s) / 60000) : 0;
}

/** Retard : (arrivée réelle − début théorique) ; retenu seulement au-delà de la tolérance, tolérance déduite */
export function computeLate(arrival: Date, shiftStart: Date, toleranceMin: number) {
  const raw = arrival > shiftStart ? minutesBetween(shiftStart, arrival) : 0;
  return { raw, retained: raw > toleranceMin ? raw - toleranceMin : 0 };
}

/** Départ anticipé : minutes avant la fin théorique, retenues au-delà de la tolérance (valeur brute retenue) */
export function computeEarlyLeave(departure: Date, shiftEnd: Date, toleranceMin: number) {
  const raw = departure < shiftEnd ? minutesBetween(departure, shiftEnd) : 0;
  return raw > toleranceMin ? raw : 0;
}

/** Heures supplémentaires potentielles : max(0, effectif − théorique), déclenchées au-delà du seuil */
export function computeOvertime(workedMinutes: number, expectedMinutes: number, thresholdMin: number) {
  const excess = workedMinutes - expectedMinutes;
  return excess > thresholdMin ? excess : 0;
}

export function computeDay(params: {
  workDate: string; tz: string; rules: ScheduleRules | null;
  arrivalAt: Date | null; departureAt: Date | null;
  breaks?: Interval[]; ctx?: DayContext;
}): DayComputation {
  const { workDate, tz, rules, arrivalAt, departureAt, breaks = [], ctx = {} } = params;
  const out: DayComputation = {
    isWorkingDay: false, expectedMinutes: 0, lateRawMinutes: 0, lateMinutes: 0, earlyLeaveMinutes: 0,
    presenceMinutes: 0, breakMinutes: 0, workedMinutes: 0, normalMinutes: 0, overtimePotentialMinutes: 0,
  };
  if (!rules) {
    if (arrivalAt && departureAt) {
      out.presenceMinutes = minutesBetween(arrivalAt, departureAt);
      out.workedMinutes = out.presenceMinutes;
    }
    return out;
  }
  const working = isScheduledWorkDay(workDate, rules) && !ctx.isHoliday && !ctx.onLeave;
  out.isWorkingDay = working;
  out.expectedMinutes = working ? rules.dailyMinutes : 0;
  const b = shiftBounds(workDate, rules, tz);

  if (arrivalAt && working) {
    const l = computeLate(arrivalAt, b.start, rules.lateToleranceMin);
    out.lateRawMinutes = l.raw; out.lateMinutes = l.retained;
  }
  if (arrivalAt && departureAt && departureAt > arrivalAt) {
    out.presenceMinutes = minutesBetween(arrivalAt, departureAt);
    if (working) out.earlyLeaveMinutes = computeEarlyLeave(departureAt, b.end, rules.earlyLeaveToleranceMin);

    const tracked = rules.breakTracking && breaks.length > 0;
    if (tracked) {
      out.breakMinutes = breaks.reduce((s, br) => {
        const end = br.end ?? departureAt; // pause non terminée : bornée au départ (anomalie signalée ailleurs)
        return s + overlap(br.start, end, arrivalAt, departureAt);
      }, 0);
    } else if (b.breakInterval) {
      // Pause non pointée : on déduit la pause planifiée qui chevauche la présence
      out.breakMinutes = overlap(arrivalAt, departureAt, b.breakInterval.start, b.breakInterval.end);
    }
    out.workedMinutes = Math.max(0, out.presenceMinutes - out.breakMinutes);
    out.normalMinutes = Math.min(out.workedMinutes, out.expectedMinutes);
    out.overtimePotentialMinutes = computeOvertime(out.workedMinutes, out.expectedMinutes, rules.overtimeThresholdMin);
  }
  return out;
}

/** Nombre de jours ouvrés d'une période (hors jours non travaillés et fériés) */
export function countWorkingDays(dates: string[], rules: ScheduleRules | null, holidays: Set<string>) {
  if (!rules) return dates.length;
  return dates.filter((d) => isScheduledWorkDay(d, rules) && !holidays.has(d)).length;
}
