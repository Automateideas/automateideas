import { and, eq, like } from "drizzle-orm";

import { db } from "@/db";
import { member, organization, user } from "@/db/schema";
import { SUBSCRIPTION_ROLES, requireOrgRole, route } from "@/lib/access";
import { paymentsEnabled } from "@/lib/subscription-billing/mode";
import { getEntitlements } from "@/lib/subscription-billing/entitlements";
import { planFor } from "@/lib/subscription-billing/plans";

// GET /api/subscription/settings: read-only billing details (owner/admin only).
// Nothing here is editable yet; it shows what the subscription is set up with.
export const GET = route(async () => {
  const { organizationId } = await requireOrgRole(SUBSCRIPTION_ROLES);

  const [[org], [owner]] = await Promise.all([
    db
      .select({
        name: organization.name,
        createdAt: organization.createdAt,
        subscriptionId: organization.subscriptionId,
      })
      .from(organization)
      .where(eq(organization.id, organizationId))
      .limit(1),
    db
      .select({ name: user.name, email: user.email })
      .from(member)
      .innerJoin(user, eq(member.userId, user.id))
      .where(and(eq(member.organizationId, organizationId), like(member.role, "%owner%")))
      .limit(1),
  ]);

  const e = await getEntitlements(organizationId);
  const plan = planFor(e.planId);
  const enabled = paymentsEnabled();
  const checkoutUrl = process.env.PAYU_BASE_URL ?? "https://test.payu.in/_payment";

  return Response.json({
    organizationName: org?.name ?? null,
    customerSince: org?.createdAt ?? null,
    billingContact: owner ?? null,
    provider: "PayU",
    paymentsEnabled: enabled,
    // Only meaningful when payments are on.
    paymentEnvironment: enabled ? (checkoutUrl.includes("test.payu.in") ? "test" : "live") : null,
    subscriptionId: org?.subscriptionId ?? null,
    planName: plan.name,
    billingCycle: e.billingCycle,
    pricePerSeatInr: plan.monthlyPricePerSeatInr,
    currentPeriodEnd: e.currentPeriodEnd,
    cancelAtPeriodEnd: e.cancelAtPeriodEnd,
    canCancel: enabled && e.planStatus === "active" && !!e.currentPeriodEnd && !e.cancelAtPeriodEnd,
    canResume: e.cancelAtPeriodEnd,
    currency: "INR",
  });
});
