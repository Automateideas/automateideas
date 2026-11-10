import { and, count, eq, gt } from "drizzle-orm";
import { APIError } from "better-auth/api";

import { db } from "@/db";
import { invitation, member, organization } from "@/db/schema";

import { computeAccess } from "./entitlements";
import { paymentsEnabled } from "./mode";
import type { PlanStatus } from "./plan";

export async function getSeatUsage(organizationId: string) {
  const [org] = await db
    .select({
      seatLimit: organization.seatLimit,
      planStatus: organization.planStatus,
      trialEndsAt: organization.trialEndsAt,
      subscriptionId: organization.subscriptionId,
      currentPeriodEnd: organization.currentPeriodEnd,
      cancelAtPeriodEnd: organization.cancelAtPeriodEnd,
    })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1);
  if (!org) throw new APIError("NOT_FOUND", { message: "Organization not found." });

  const [[members], [pending]] = await Promise.all([
    db
      .select({ n: count() })
      .from(member)
      .where(eq(member.organizationId, organizationId)),
    // Expired invites can't be accepted, so they don't hold a seat.
    db
      .select({ n: count() })
      .from(invitation)
      .where(
        and(
          eq(invitation.organizationId, organizationId),
          eq(invitation.status, "pending"),
          gt(invitation.expiresAt, new Date()),
        ),
      ),
  ]);

  return {
    ...org,
    planStatus: org.planStatus as PlanStatus,
    members: members.n,
    pendingInvites: pending.n,
    used: members.n + pending.n,
  };
}

export type SeatUsage = Awaited<ReturnType<typeof getSeatUsage>>;

/**
 * Why the subscription stops the org adding people, or null. Only a read-only
 * workspace (after the grace period) is blocked; see entitlements.ts.
 */
export function planBlockReason(usage: SeatUsage): string | null {
  const access = computeAccess(usage, { paymentsEnabled: paymentsEnabled() });
  return access.state === "read_only" ? access.reason : null;
}

/**
 * Throws a 403 with a clear message when the org can't take another invite.
 * Members and unexpired pending invites both count against the seat limit.
 */
export async function assertCanInvite(organizationId: string) {
  const usage = await getSeatUsage(organizationId);

  const blocked = planBlockReason(usage);
  if (blocked) throw new APIError("FORBIDDEN", { code: "PLAN_INACTIVE", message: blocked });

  if (usage.used >= usage.seatLimit) {
    throw new APIError("FORBIDDEN", {
      code: "SEAT_LIMIT_REACHED",
      message:
        `All ${usage.seatLimit} seats are in use ` +
        `(${usage.members} members, ${usage.pendingInvites} pending invites). ` +
        "Buy more seats or cancel a pending invite.",
    });
  }
}
