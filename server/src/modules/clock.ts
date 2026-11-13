import { Router } from 'express';
import { z } from 'zod';
import { ah, parse } from '../utils/http.js';
import { forbidden } from '../utils/errors.js';
import { performClock, getClockStatus } from '../services/clock.js';

export const router = Router();
const ACTIONS = ['ARRIVEE', 'DEPART', 'PAUSE_DEBUT', 'PAUSE_FIN'] as const;

router.get('/status', ah(async (req, res) => {
  if (!req.user!.employeeId) throw forbidden("Ce compte n'est pas rattaché à un employé.");
  res.json(await getClockStatus(req.user!.employeeId));
}));

router.post('/scan', ah(async (req, res) => {
  if (!req.user!.employeeId) throw forbidden("Ce compte n'est pas rattaché à un employé.");
  const b = parse(z.object({ action: z.enum(ACTIONS), qrPayload: z.string().min(1).max(600), idempotencyKey: z.string().min(8).max(80).optional(), clientTime: z.string().max(40).optional() }), req.body);
  const r = await performClock({ employeeId: req.user!.employeeId, action: b.action, qrPayload: b.qrPayload, idempotencyKey: b.idempotencyKey, clientTime: b.clientTime, source: 'QR_MOBILE', req });
  res.json({ ok: true, replay: r.replay, event: { type: r.event.type, serverTime: r.event.serverTime }, warnings: (r as any).warnings ?? [], message: r.message, status: await getClockStatus(req.user!.employeeId) });
}));
