// Formatage FR, toujours dans le fuseau de l'entreprise (company.timezone).
// L'AuthProvider appelle setTimezone() dès que /auth/me répond.

const LOCALE = 'fr-FR';
let TZ = 'Africa/Abidjan';
let CURRENCY = 'XOF';

export function setTimezone(tz?: string | null) {
  if (tz) TZ = tz;
}
export function setCurrency(c?: string | null) {
  if (c) CURRENCY = c;
}
export function getTimezone() {
  return TZ;
}

type DateInput = string | number | Date | null | undefined;
const DASH = '—';

/** Une `workDate` 'YYYY-MM-DD' est une date calendaire : on la fixe à midi UTC pour éviter tout décalage. */
function toDate(v: DateInput): Date | null {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(`${v}T12:00:00Z`);
  if (typeof v === 'string' && /^\d{4}-\d{2}$/.test(v)) return new Date(`${v}-15T12:00:00Z`);
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

function isCalendar(v: DateInput) {
  return typeof v === 'string' && /^\d{4}-\d{2}(-\d{2})?$/.test(v);
}

function fmt(v: DateInput, opts: Intl.DateTimeFormatOptions): string {
  const d = toDate(v);
  if (!d) return DASH;
  return new Intl.DateTimeFormat(LOCALE, { timeZone: isCalendar(v) ? 'UTC' : TZ, ...opts }).format(d);
}

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** 13/11/2026 */
export const formatDate = (v: DateInput) => fmt(v, { day: '2-digit', month: '2-digit', year: 'numeric' });
/** 13 nov. 2026 */
export const formatDateShort = (v: DateInput) => fmt(v, { day: 'numeric', month: 'short', year: 'numeric' });
/** Jeudi 13 novembre 2026 */
export const formatDateLong = (v: DateInput) =>
  cap(fmt(v, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
/** Jeu. 13 nov. */
export const formatDayShort = (v: DateInput) => cap(fmt(v, { weekday: 'short', day: 'numeric', month: 'short' }));
/** Jeudi */
export const formatWeekday = (v: DateInput) => cap(fmt(v, { weekday: 'long' }));
/** Novembre 2026 (accepte 'YYYY-MM') */
export const formatMonth = (v: DateInput) => cap(fmt(v, { month: 'long', year: 'numeric' }));
/** 08:04 */
export const formatTime = (v: DateInput) => fmt(v, { hour: '2-digit', minute: '2-digit', hour12: false });
/** 08:04:12 */
export const formatTimeSeconds = (v: DateInput) =>
  fmt(v, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
/** 13/11/2026 à 08:04 */
export const formatDateTime = (v: DateInput) => {
  const d = toDate(v);
  return d ? `${formatDate(v)} à ${formatTime(v)}` : DASH;
};

/** Minutes → « 7 h 45 », « 45 min », « 8 h ». Signe conservé si negative. */
export function formatDuration(minutes: number | null | undefined, opts: { zero?: string } = {}): string {
  if (minutes === null || minutes === undefined || isNaN(minutes)) return DASH;
  const sign = minutes < 0 ? '-' : '';
  const m = Math.round(Math.abs(minutes));
  if (m === 0) return opts.zero ?? '0 min';
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${sign}${r} min`;
  if (r === 0) return `${sign}${h} h`;
  return `${sign}${h} h ${String(r).padStart(2, '0')}`;
}

/** « il y a 5 min », « hier », sinon date courte. */
export function formatRelative(v: DateInput): string {
  const d = toDate(v);
  if (!d) return DASH;
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 45) return "à l'instant";
  if (diff < 3600) return `il y a ${Math.round(diff / 60)} min`;
  if (diff < 86400) return `il y a ${Math.round(diff / 3600)} h`;
  if (diff < 172800) return 'hier';
  if (diff < 604800) return `il y a ${Math.round(diff / 86400)} j`;
  return formatDateShort(v);
}

/** Parties de date dans le fuseau entreprise. */
function zonedParts(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return { y: get('year'), m: get('month'), d: get('day') };
}

/** Date du jour 'YYYY-MM-DD' dans le fuseau entreprise. */
export function todayISO(): string {
  const { y, m, d } = zonedParts();
  return `${y}-${m}-${d}`;
}
/** Mois courant 'YYYY-MM'. */
export function currentMonthISO(): string {
  const { y, m } = zonedParts();
  return `${y}-${m}`;
}
/** Décale une date 'YYYY-MM-DD' de n jours. */
export function addDaysISO(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** Décale un mois 'YYYY-MM' de n mois. */
export function addMonthsISO(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}
/** Premier / dernier jour d'un mois 'YYYY-MM'. */
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, '0')}` };
}

export const WEEKDAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'] as const;
export const WEEKDAYS_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'] as const;
/** 1..7 (ISO, 1 = lundi) → « Lundi ». */
export const dayName = (n: number, short = false) => (short ? WEEKDAYS_SHORT : WEEKDAYS)[(n - 1 + 7) % 7] ?? '';
/** [1,2,3,4,5] → « Lun – Ven » ; sinon liste. */
export function formatWorkDays(days: number[]): string {
  const s = [...days].sort((a, b) => a - b);
  if (!s.length) return DASH;
  const contiguous = s.every((v, i) => i === 0 || v === s[i - 1] + 1);
  if (contiguous && s.length > 2) return `${dayName(s[0], true)} – ${dayName(s[s.length - 1], true)}`;
  return s.map((d) => dayName(d, true)).join(', ');
}

export const formatNumber = (n: number | null | undefined, digits = 0) =>
  n === null || n === undefined || isNaN(n)
    ? DASH
    : new Intl.NumberFormat(LOCALE, { maximumFractionDigits: digits }).format(n);

/** 0.873 ou 87.3 → « 87,3 % » (valeurs > 1 considérées déjà en pourcentage). */
export function formatPercent(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || isNaN(n)) return DASH;
  const v = n <= 1 && n >= -1 ? n * 100 : n;
  return `${new Intl.NumberFormat(LOCALE, { maximumFractionDigits: digits }).format(v)} %`;
}

export const formatCurrency = (n: number | null | undefined) =>
  n === null || n === undefined || isNaN(n)
    ? DASH
    : new Intl.NumberFormat(LOCALE, { style: 'currency', currency: CURRENCY, maximumFractionDigits: 0 }).format(n);
