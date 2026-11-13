import cron, { type ScheduledTask } from 'node-cron';
import { closeDays } from '../services/attendance.js';
import { runBackup } from '../modules/admin.js';
import { getSettings } from '../services/settings.js';

let running = false;
let backupTask: ScheduledTask | null = null;
let backupCron = '';

export function startJobs() {
  // Clôture des journées et détection des anomalies toutes les 10 minutes
  cron.schedule('*/10 * * * *', async () => {
    if (running) return; running = true;
    try { await closeDays({ daysBack: 7 }); } catch (e) { console.error('Clôture des journées :', e); } finally { running = false; }
  });
  setTimeout(() => closeDays({ daysBack: 7 }).catch((e) => console.error(e)), 5000);
  // Sauvegarde automatique selon les paramètres (replanifiée si la configuration change)
  const plan = async () => {
    const s = (await getSettings()).backup;
    const expr = s.enabled && cron.validate(s.cron) ? s.cron : '';
    if (expr === backupCron) return;
    backupTask?.stop(); backupTask = null; backupCron = expr;
    if (expr) backupTask = cron.schedule(expr, () => { runBackup('AUTO', null).catch((e) => console.error('Sauvegarde :', e)); }, { timezone: 'Africa/Abidjan' });
  };
  plan().catch(() => {});
  setInterval(() => plan().catch(() => {}), 60_000);
}
