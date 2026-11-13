import { getTimezone } from '@/lib/format';

/** Décalage (ms) du fuseau `tz` à l'instant `utcMs`. */
function tzOffsetMs(utcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'), g('second'));
  return asUtc - utcMs;
}

/** 'YYYY-MM-DD' + 'HH:mm' saisis en heure locale de l'entreprise → ISO 8601 UTC. */
export function localToISO(date: string, time: string, tz = getTimezone()): string | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const tm = /^(\d{2}):(\d{2})$/.exec(time);
  if (!dm || !tm) return null;
  const guess = Date.UTC(+dm[1], +dm[2] - 1, +dm[3], +tm[1], +tm[2]);
  let ms = guess - tzOffsetMs(guess, tz);
  ms = guess - tzOffsetMs(ms, tz); // seconde passe (changements d'heure)
  return new Date(ms).toISOString();
}

/** ISO UTC → 'HH:mm' dans le fuseau de l'entreprise (pour pré-remplir un champ heure). */
export function isoToLocalTime(iso: string | null | undefined, tz = getTimezone()): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('fr-FR', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
}
