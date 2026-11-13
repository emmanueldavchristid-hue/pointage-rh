import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema.js';
import { env } from '../config/env.js';

// Les DATE Postgres restent des chaînes 'YYYY-MM-DD' (pas de décalage de fuseau)
pg.types.setTypeParser(1082, (v) => v);

export const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 20 });
export const db = drizzle(pool, { schema });
export type DB = typeof db;
export type Tx = Parameters<Parameters<DB['transaction']>[0]>[0];
export { schema };
