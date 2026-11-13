import multer from 'multer';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { badRequest } from '../utils/errors.js';

const IMG = ['image/png', 'image/jpeg', 'image/webp'];
const DOCS = [...IMG, 'application/pdf'];
const mk = (types: string[], maxMb: number) => multer({
  storage: multer.memoryStorage(), limits: { fileSize: maxMb * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => types.includes(file.mimetype) ? cb(null, true) : cb(badRequest('FILE_TYPE', `Type de fichier non autorisé (${types.map((t) => t.split('/')[1]).join(', ')}).`) as any),
});
export const uploadImage = mk(IMG, 2);
export const uploadDoc = mk(DOCS, 5);
export const uploadXlsx = mk(['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'], 5);

/** Vérifie la signature binaire (magic bytes) pour ne pas se fier au seul type MIME déclaré */
function sniff(buf: Buffer): string | null {
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpg';
  if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'webp';
  if (buf.subarray(0, 5).toString() === '%PDF-') return 'pdf';
  return null;
}

/** Stocke un fichier sous un nom aléatoire (jamais le nom fourni) ; renvoie le chemin relatif */
export async function storeUpload(file: Express.Multer.File, folder: string) {
  const ext = sniff(file.buffer);
  if (!ext) throw badRequest('FILE_TYPE', 'Contenu de fichier non reconnu ou non autorisé.');
  const rel = path.posix.join(folder, `${crypto.randomBytes(16).toString('hex')}.${ext}`);
  const abs = path.join(env.UPLOAD_DIR, rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, file.buffer);
  return rel;
}
export const absUpload = (rel: string) => path.join(env.UPLOAD_DIR, rel);
