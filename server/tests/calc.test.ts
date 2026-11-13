import { describe, it, expect } from 'vitest';
import { computeDay, computeLate, computeOvertime, shiftBounds, ScheduleRules } from '../src/services/calc';

const TZ = 'Africa/Abidjan';
const base: ScheduleRules = {
  startTime: '08:00', endTime: '17:00', breakStart: '12:00', breakEnd: '13:00', workDays: [1, 2, 3, 4, 5],
  dailyMinutes: 480, lateToleranceMin: 10, earlyLeaveToleranceMin: 0, overtimeThresholdMin: 0,
  breakTracking: false, maxBreaks: 1, arrivalWindowBeforeMin: 120,
};
const at = (s: string) => new Date(s);
const MON = '2026-11-16'; // lundi

describe('retards', () => {
  it("exemple du cahier des charges : 08h25, tolérance 10 → 15 min", () => {
    expect(computeLate(at(`${MON}T08:25:00Z`), at(`${MON}T08:00:00Z`), 10)).toEqual({ raw: 25, retained: 15 });
  });
  it('arrivée à l\'heure → 0', () => {
    expect(computeDay({ workDate: MON, tz: TZ, rules: base, arrivalAt: at(`${MON}T08:00:00Z`), departureAt: null }).lateMinutes).toBe(0);
  });
  it('arrivée avant l\'heure → 0', () => {
    const r = computeDay({ workDate: MON, tz: TZ, rules: base, arrivalAt: at(`${MON}T07:40:00Z`), departureAt: null });
    expect(r.lateRawMinutes).toBe(0); expect(r.lateMinutes).toBe(0);
  });
  it('arrivée pendant la tolérance → retard brut 8, retenu 0', () => {
    const r = computeDay({ workDate: MON, tz: TZ, rules: base, arrivalAt: at(`${MON}T08:08:00Z`), departureAt: null });
    expect(r.lateRawMinutes).toBe(8); expect(r.lateMinutes).toBe(0);
  });
  it('arrivée exactement à la limite de tolérance → 0', () => {
    expect(computeLate(at(`${MON}T08:10:00Z`), at(`${MON}T08:00:00Z`), 10).retained).toBe(0);
  });
  it('arrivée après la tolérance → 11 - 10 = 1', () => {
    expect(computeLate(at(`${MON}T08:11:00Z`), at(`${MON}T08:00:00Z`), 10).retained).toBe(1);
  });
  it('pas de retard un jour non travaillé', () => {
    const r = computeDay({ workDate: '2026-11-15', tz: TZ, rules: base, arrivalAt: at('2026-11-15T09:00:00Z'), departureAt: null });
    expect(r.lateMinutes).toBe(0); expect(r.isWorkingDay).toBe(false);
  });
});

describe('présence, pause, travail effectif, heures sup', () => {
  it('journée complète 08:00-17:00 : présence 540, pause 60, effectif 480, HS 0', () => {
    const r = computeDay({ workDate: MON, tz: TZ, rules: base, arrivalAt: at(`${MON}T08:00:00Z`), departureAt: at(`${MON}T17:00:00Z`) });
    expect(r).toMatchObject({ presenceMinutes: 540, breakMinutes: 60, workedMinutes: 480, normalMinutes: 480, overtimePotentialMinutes: 0, earlyLeaveMinutes: 0 });
  });
  it('présence ≠ travail effectif ; départ 18:30 → 90 min HS potentielles', () => {
    const r = computeDay({ workDate: MON, tz: TZ, rules: base, arrivalAt: at(`${MON}T08:00:00Z`), departureAt: at(`${MON}T18:30:00Z`) });
    expect(r.presenceMinutes).toBe(630); expect(r.workedMinutes).toBe(570); expect(r.overtimePotentialMinutes).toBe(90);
  });
  it('seuil HS : excédent sous le seuil → 0', () => {
    expect(computeOvertime(500, 480, 30)).toBe(0);
    expect(computeOvertime(520, 480, 30)).toBe(40);
  });
  it('départ anticipé 16:00 → 60 min', () => {
    const r = computeDay({ workDate: MON, tz: TZ, rules: base, arrivalAt: at(`${MON}T08:00:00Z`), departureAt: at(`${MON}T16:00:00Z`) });
    expect(r.earlyLeaveMinutes).toBe(60); expect(r.workedMinutes).toBe(420);
  });
  it('demi-journée matin sans chevauchement de pause → pause 0', () => {
    const r = computeDay({ workDate: MON, tz: TZ, rules: base, arrivalAt: at(`${MON}T08:00:00Z`), departureAt: at(`${MON}T11:30:00Z`) });
    expect(r.breakMinutes).toBe(0); expect(r.workedMinutes).toBe(210);
  });
  it('pauses pointées : durée réelle déduite', () => {
    const rules = { ...base, breakTracking: true, maxBreaks: 2 };
    const r = computeDay({ workDate: MON, tz: TZ, rules, arrivalAt: at(`${MON}T08:00:00Z`), departureAt: at(`${MON}T17:00:00Z`),
      breaks: [{ start: at(`${MON}T12:00:00Z`), end: at(`${MON}T12:45:00Z`) }, { start: at(`${MON}T15:00:00Z`), end: at(`${MON}T15:10:00Z`) }] });
    expect(r.breakMinutes).toBe(55); expect(r.workedMinutes).toBe(485); expect(r.overtimePotentialMinutes).toBe(5);
  });
  it('jour férié : théorique 0, tout le travail est HS potentielle', () => {
    const r = computeDay({ workDate: MON, tz: TZ, rules: base, arrivalAt: at(`${MON}T09:00:00Z`), departureAt: at(`${MON}T11:00:00Z`), ctx: { isHoliday: true } });
    expect(r.expectedMinutes).toBe(0); expect(r.overtimePotentialMinutes).toBe(120);
  });
  it('oubli de départ : aucune présence calculée', () => {
    const r = computeDay({ workDate: MON, tz: TZ, rules: base, arrivalAt: at(`${MON}T08:00:00Z`), departureAt: null });
    expect(r.presenceMinutes).toBe(0); expect(r.workedMinutes).toBe(0);
  });
});

describe('horaires de nuit (traversant minuit)', () => {
  const night: ScheduleRules = { ...base, startTime: '22:00', endTime: '06:00', breakStart: '02:00', breakEnd: '02:30', dailyMinutes: 450, workDays: [1, 2, 3, 4, 5, 6, 7] };
  it('bornes : fin le lendemain', () => {
    const b = shiftBounds(MON, night, TZ);
    expect(b.end.toISOString()).toBe('2026-11-17T06:00:00.000Z');
    expect(b.breakInterval!.start.toISOString()).toBe('2026-11-17T02:00:00.000Z');
  });
  it('22:15 → 06:00 : retard 5 (tolérance 10), effectif 435', () => {
    const r = computeDay({ workDate: MON, tz: TZ, rules: night, arrivalAt: at(`${MON}T22:15:00Z`), departureAt: at('2026-11-17T06:00:00Z') });
    expect(r.lateMinutes).toBe(5); expect(r.breakMinutes).toBe(30); expect(r.workedMinutes).toBe(435);
  });
});

describe('fuseau horaire non UTC', () => {
  it('Europe/Paris : 08:25 locale = 07:25Z en hiver', () => {
    const r = computeDay({ workDate: MON, tz: 'Europe/Paris', rules: base, arrivalAt: at(`${MON}T07:25:00Z`), departureAt: null });
    expect(r.lateMinutes).toBe(15);
  });
});
