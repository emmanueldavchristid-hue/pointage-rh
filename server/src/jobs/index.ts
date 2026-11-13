import cron from 'node-cron';
import { closeDays } from '../services/attendance.js';

let running = false;
export function startJobs() {
  // Clôture des journées et détection des anomalies toutes les 10 minutes
  cron.schedule('*/10 * * * *', async () => {
    if (running) return; running = true;
    try { await closeDays({ daysBack: 7 }); } catch (e) { console.error('Clôture des journées :', e); } finally { running = false; }
  });
  setTimeout(() => closeDays({ daysBack: 7 }).catch((e) => console.error(e)), 5000);
}
