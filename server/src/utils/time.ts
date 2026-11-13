import { DateTime } from 'luxon';

/** Helpers fuseau horaire — toutes les dates de travail sont exprimées dans le fuseau de l'entreprise */
export const nowUtc = () => new Date();

export function localDate(d: Date, tz: string): string {
  return DateTime.fromJSDate(d, { zone: tz }).toISODate()!;
}
export function isoWeekday(dateStr: string): number {
  return DateTime.fromISO(dateStr).weekday; // 1 = lundi
}
/** Combine une date locale + HH:mm (+ décalage de jours) en instant UTC */
export function atLocal(dateStr: string, hhmm: string, tz: string, plusDays = 0): Date {
  const [h, m] = hhmm.split(':').map(Number);
  return DateTime.fromISO(dateStr, { zone: tz }).plus({ days: plusDays }).set({ hour: h, minute: m, second: 0, millisecond: 0 }).toJSDate();
}
export function addDays(dateStr: string, n: number): string {
  return DateTime.fromISO(dateStr).plus({ days: n }).toISODate()!;
}
export function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  let d = DateTime.fromISO(from);
  const end = DateTime.fromISO(to);
  while (d <= end && out.length < 1000) { out.push(d.toISODate()!); d = d.plus({ days: 1 }); }
  return out;
}
export const minutesBetween = (a: Date, b: Date) => Math.max(0, Math.round((b.getTime() - a.getTime()) / 60000));
export function fmtTime(d: Date | null | undefined, tz: string) {
  return d ? DateTime.fromJSDate(d, { zone: tz }).toFormat('HH:mm') : '';
}
export function fmtDate(s: string) { return DateTime.fromISO(s).setLocale('fr').toFormat('dd/MM/yyyy'); }
export function fmtMinutes(m: number) {
  const sign = m < 0 ? '-' : ''; m = Math.abs(Math.round(m));
  return `${sign}${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
}
