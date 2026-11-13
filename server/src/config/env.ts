import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().default('postgres://pointage:pointage@localhost:5432/pointage'),
  JWT_SECRET: z.string().min(16).default('dev-secret-change-me-please-32chars!!'),
  QR_SECRET: z.string().min(16).default('dev-qr-secret-change-me-32chars!!!!'),
  COOKIE_SECURE: z.enum(['true', 'false', 'auto']).default('auto'),
  UPLOAD_DIR: z.string().default('./data/uploads'),
  BACKUP_DIR: z.string().default('./data/backups'),
  TRUST_PROXY: z.string().default('loopback'),
  PUBLIC_URL: z.string().default('https://pointage.entreprise.local'),
  DISABLE_JOBS: z.enum(['true', 'false']).default('false'),
});

export const env = schema.parse(process.env);

if (env.NODE_ENV === 'production' && (env.JWT_SECRET.startsWith('dev-') || env.QR_SECRET.startsWith('dev-'))) {
  // Refus de démarrer en production avec les secrets de développement
  throw new Error('JWT_SECRET et QR_SECRET doivent être définis en production (voir .env.example)');
}
