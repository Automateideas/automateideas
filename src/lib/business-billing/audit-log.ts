import { and, count, desc, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { auditLogs, user } from "@/db/schema";

import { withTenant } from "./tenant-db";

// Reading the audit trail (written by lib/audit.ts). Newest first.

export async function listAuditLogs(organizationId: string, q: { page: number; pageSize: number; entityType: string | null; entityId: string | null }) {
  const rows = await withTenant(organizationId, async (tx) => {
    const filter = and(eq(auditLogs.organizationId, organizationId), q.entityType ? eq(auditLogs.entityType, q.entityType) : undefined, q.entityId ? eq(auditLogs.entityId, q.entityId) : undefined);
    const [{ total }] = await tx.select({ total: count() }).from(auditLogs).where(filter);
    const items = await tx
      .select()
      .from(auditLogs)
      .where(filter)
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    return { total, items };
  });
  // Names of the people who made the changes (users aren't tenant data, so read them directly).
  const ids = [...new Set(rows.items.map((r) => r.actorUserId).filter((v): v is string => !!v))];
  const people = ids.length ? await db.select({ id: user.id, name: user.name, email: user.email }).from(user).where(inArray(user.id, ids)) : [];
  const byId = new Map(people.map((p) => [p.id, p]));
  return {
    items: rows.items.map((r) => ({
      id: r.id,
      at: r.createdAt,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      actor: r.actorUserId ? (byId.get(r.actorUserId)?.name ?? "Removed user") : "System",
      actorEmail: r.actorUserId ? (byId.get(r.actorUserId)?.email ?? null) : null,
      ipAddress: r.ipAddress,
      details: r.changes,
    })),
    total: rows.total,
    page: q.page,
    pageSize: q.pageSize,
  };
}
