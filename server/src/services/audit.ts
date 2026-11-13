import type { Request } from 'express';
import { db, schema } from '../db/index.js';
import type { Tx } from '../db/index.js';

export async function audit(req: Request | null, action: string, data: {
  entity?: string; entityId?: string | number; before?: unknown; after?: unknown; reason?: string;
  userId?: number | null; userLogin?: string | null;
} = {}, tx?: Tx) {
  const u = req?.user;
  await (tx ?? db).insert(schema.auditLogs).values({
    userId: data.userId ?? u?.id ?? null,
    userLogin: data.userLogin ?? u?.login ?? null,
    action, entity: data.entity, entityId: data.entityId != null ? String(data.entityId) : null,
    before: (data.before ?? null) as any, after: (data.after ?? null) as any, reason: data.reason,
    ip: req?.ip ?? null, userAgent: req?.get?.('user-agent') ?? null,
  });
}
