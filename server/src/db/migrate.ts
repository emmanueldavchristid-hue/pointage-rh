import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from './index.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../drizzle');
export async function runMigrations() {
  await migrate(db, { migrationsFolder: dir });
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runMigrations().then(() => { console.log('Migrations appliquées'); return pool.end(); })
    .catch((e) => { console.error(e); process.exit(1); });
}
