import { eq } from "drizzle-orm";
import { APIError } from "better-auth/api";

import { db } from "@/db";
import { organization } from "@/db/schema";
import { appUrl } from "@/lib/email";

import { getEntitlements } from "./entitlements";
import { paymentsEnabled } from "./mode";
import { buildSeatCheckout } from "./payu";
import { type BillingCycle, type PlanId, PLANS, isBillingCycle, isPlanId, periodTotalInr, planFor } from "./plans";
import { getSeatUsage } from "./seats";

export type ChangeRequest = {
  /** Omitted: keep the current plan / cycle. */
  planId?: unknown;
  billingCycle?: unknown;
  seats: unknown;
};

/**
 * Switch plan, billing cycle or seat count, or renew.
 *
 * Payments off (early access): applied at once, free.
 * Payments on: returns a PayU checkout; nothing changes until the webhook
 * confirms payment (lib/subscription-billing + /api/webhooks/payu). A paid
 * change starts a new period from the payment date; the unused part of the
 * old period isn't credited (no proration yet).
 */
export async function changeSubscription(
  organizationId: string,
  user: { name: string; email: string },
  req: ChangeRequest,
) {
  const [current, usage] = await Promise.all([getEntitlements(organizationId), getSeatUsage(organizationId)]);

  if (req.planId !== undefined && !isPlanId(req.planId)) {
    throw new APIError("BAD_REQUEST", { code: "INVALID_PLAN", message: `Choose one of: ${Object.values(PLANS).map((p) => p.name).join(", ")}.` });
  }
  if (req.billingCycle !== undefined && !isBillingCycle(req.billingCycle)) {
    throw new APIError("BAD_REQUEST", { code: "INVALID_CYCLE", message: "Billing cycle must be monthly or yearly." });
  }
  const planId: PlanId = (req.planId as PlanId | undefined) ?? current.planId;
  const billingCycle: BillingCycle = (req.billingCycle as BillingCycle | undefined) ?? current.billingCycle;
  const plan = planFor(planId);

  const seats = req.seats;
  if (typeof seats !== "number" || !Number.isInteger(seats) || seats < 1) {
    throw new APIError("BAD_REQUEST", { code: "INVALID_SEATS", message: "Seats must be a whole number of at least 1." });
  }
  if (seats > plan.limits.maxSeats) {
    throw new APIError("BAD_REQUEST", {
      code: "SEATS_ABOVE_PLAN",
      message: `${plan.name} allows up to ${plan.limits.maxSeats} seats. Choose a bigger plan for more.`,
    });
  }
  if (seats < usage.members) {
    throw new APIError("CONFLICT", {
      code: "SEATS_BELOW_MEMBERS",
      message: `You have ${usage.members} members. Remove ${usage.members - seats} before reducing to ${seats} seats.`,
    });
  }

  const unchanged = planId === current.planId && billingCycle === current.billingCycle && seats === usage.seatLimit;
  // The same choice is allowed only as a renewal: paid workspaces whose access isn't full.
  const isRenewal = paymentsEnabled() && current.access.state !== "full";
  if (unchanged && !isRenewal && (!paymentsEnabled() || current.planStatus === "active")) {
    throw new APIError("BAD_REQUEST", { code: "NO_CHANGE", message: "That's already your plan." });
  }

  const total = periodTotalInr(plan, billingCycle, seats);
  const summary = {
    planId,
    billingCycle,
    seats,
    periodTotalInr: total,
    // Older clients read this; the monthly-equivalent price.
    monthlyTotalInr: plan.monthlyPricePerSeatInr * seats,
  };

  if (!paymentsEnabled()) {
    await db
      .update(organization)
      .set({ planId, billingCycle, seatLimit: seats })
      .where(eq(organization.id, organizationId));
    return { ...summary, applied: true as const };
  }

  const checkout = buildSeatCheckout({
    organizationId,
    seats,
    planId,
    billingCycle,
    firstname: user.name.split(" ")[0] || user.name,
    email: user.email,
    surl: appUrl("/api/subscription/return"),
    furl: appUrl("/api/subscription/return"),
  });
  return { ...summary, checkout };
}

/** Stop renewing: access continues until the period ends, then read-only (data kept). */
export async function cancelSubscription(organizationId: string) {
  const e = await getEntitlements(organizationId);
  if (!paymentsEnabled() || e.planStatus !== "active" || !e.currentPeriodEnd) {
    throw new APIError("BAD_REQUEST", {
      code: "NOTHING_TO_CANCEL",
      message: "There's no paid subscription to cancel. Free trials and early access end on their own.",
    });
  }
  if (e.cancelAtPeriodEnd) throw new APIError("BAD_REQUEST", { code: "ALREADY_CANCELED", message: "Your subscription is already set to end." });
  await db.update(organization).set({ cancelAtPeriodEnd: true }).where(eq(organization.id, organizationId));
  return getEntitlements(organizationId);
}

/** Undo a cancellation before the period ends. */
export async function resumeSubscription(organizationId: string) {
  const e = await getEntitlements(organizationId);
  if (!e.cancelAtPeriodEnd) throw new APIError("BAD_REQUEST", { code: "NOT_CANCELED", message: "Your subscription isn't set to end." });
  if (e.currentPeriodEnd && e.currentPeriodEnd < new Date()) {
    throw new APIError("BAD_REQUEST", { code: "PERIOD_ENDED", message: "This period has ended. Choose a plan to subscribe again." });
  }
  await db.update(organization).set({ cancelAtPeriodEnd: false }).where(eq(organization.id, organizationId));
  return getEntitlements(organizationId);
}
