import { createHash, randomBytes } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { documentShares } from "@/db/schema";
import { appUrl } from "@/lib/email";

import type { TenantTx } from "../tenant-db";
import { withTenant } from "../tenant-db";

// Secret links to one document's PDF, for customers without a login.
// The token is random (192 bits) and only its SHA-256 hash is stored, so a
// database leak doesn't expose working links. Links expire after
// SHARE_DAYS and can be revoked.

export const SHARE_DAYS = 180;
export const TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const shareUrl = (token: string) => appUrl(`/share/${token}`);

/** A new link to a document ("invoices", "quotations"… or "receipt"). */
export async function createShare(tx: TenantTx, organizationId: string, userId: string | null, documentType: string, documentId: string) {
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + SHARE_DAYS * 86_400_000);
  await tx.insert(documentShares).values({ organizationId, documentType, documentId, tokenHash: hashToken(token), expiresAt, createdBy: userId, updatedBy: userId });
  return { token, url: shareUrl(token), expiresAt };
}

export type ResolvedShare = { organizationId: string; documentType: string; documentId: string };

/**
 * The document a token points to, or null (unknown, expired or revoked).
 * Looks the token up under row-level security with only the token's hash
 * visible (policy share_token_lookup), then counts the view as the owning tenant.
 */
export async function resolveShare(token: string): Promise<ResolvedShare | null> {
  if (!TOKEN_RE.test(token)) return null;
  const hash = hashToken(token);
  const row = await db.transaction(async (tx) => {
    await tx.execute(sql`set local role billing_tenant`);
    await tx.execute(sql`select set_config('app.share_token', ${hash}, true)`);
    const [r] = await tx
      .select({ id: documentShares.id, organizationId: documentShares.organizationId, documentType: documentShares.documentType, documentId: documentShares.documentId, expiresAt: documentShares.expiresAt, revokedAt: documentShares.revokedAt })
      .from(documentShares)
      .where(eq(documentShares.tokenHash, hash));
    return r ?? null;
  });
  if (!row || row.revokedAt || row.expiresAt < new Date()) return null;
  await withTenant(row.organizationId, (tx) =>
    tx
      .update(documentShares)
      .set({ views: sql`${documentShares.views} + 1`, lastViewedAt: new Date() })
      .where(and(eq(documentShares.organizationId, row.organizationId), eq(documentShares.id, row.id))),
  );
  return { organizationId: row.organizationId, documentType: row.documentType, documentId: row.documentId };
}

/** Turns off every link to a document (e.g. sent to the wrong person). */
export async function revokeShares(organizationId: string, documentType: string, documentId: string, userId: string) {
  return withTenant(organizationId, async (tx) => {
    const rows = await tx
      .update(documentShares)
      .set({ revokedAt: new Date(), updatedBy: userId })
      .where(and(eq(documentShares.organizationId, organizationId), eq(documentShares.documentType, documentType), eq(documentShares.documentId, documentId), sql`${documentShares.revokedAt} is null`))
      .returning({ id: documentShares.id });
    return { revoked: rows.length };
  });
}
