import fs from 'node:fs';
import { env } from './config/env.js';
import { createApp } from './app.js';
import { runMigrations } from './db/migrate.js';
import { bootstrapIfEmpty } from './db/bootstrap.js';
import { startJobs } from './jobs/index.js';

async function main() {
  fs.mkdirSync(env.UPLOAD_DIR, { recursive: true });
  fs.mkdirSync(env.BACKUP_DIR, { recursive: true });
  await runMigrations();
  await bootstrapIfEmpty();
  const app = createApp();
  app.listen(env.PORT, '0.0.0.0', () => console.log(`Pointage RH API — port ${env.PORT} (${env.NODE_ENV})`));
  if (env.DISABLE_JOBS !== 'true') startJobs();
}
main().catch((e) => { console.error('Démarrage impossible :', e); process.exit(1); });
