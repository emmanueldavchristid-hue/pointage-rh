import { Router } from 'express';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { ah, parse, zId } from '../utils/http.js';

export const router = Router();
router.get('/', ah(async (req, res) => {
  const uid = req.user!.id;
  const limit = Math.min(100, Number(req.query.limit) || 30);
  const conds = [eq(schema.notifications.userId, uid)];
  if (req.query.unread === '1') conds.push(isNull(schema.notifications.readAt));
  const items = await db.select().from(schema.notifications).where(and(...conds)).orderBy(desc(schema.notifications.createdAt)).limit(limit);
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.notifications).where(and(eq(schema.notifications.userId, uid), isNull(schema.notifications.readAt)));
  res.json({ items: items.map(({ userId, ...n }) => n), unreadCount: n });
}));
router.post('/read-all', ah(async (req, res) => {
  await db.update(schema.notifications).set({ readAt: new Date() }).where(and(eq(schema.notifications.userId, req.user!.id), isNull(schema.notifications.readAt)));
  res.json({ ok: true });
}));
router.post('/:id/read', ah(async (req, res) => {
  const id = parse(zId, req.params.id);
  await db.update(schema.notifications).set({ readAt: new Date() }).where(and(eq(schema.notifications.id, id), eq(schema.notifications.userId, req.user!.id)));
  res.json({ ok: true });
}));
