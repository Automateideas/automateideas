import { SUBSCRIPTION_ROLES, requireOrgRole, route } from "@/lib/access";
import { getEntitlements, invoiceUsage } from "@/lib/subscription-billing/entitlements";
import { paymentsEnabled } from "@/lib/subscription-billing/mode";
import { periodTotalInr, planFor, pricePerSeatInr } from "@/lib/subscription-billing/plans";
import { getSeatUsage, planBlockReason } from "@/lib/subscription-billing/seats";

// GET /api/subscription: plan, cycle, seats, price and access (owner/admin only).
// The fields from before plans existed keep their meaning.
export const GET = route(async () => {
  const { organizationId } = await requireOrgRole(SUBSCRIPTION_ROLES);
  const [usage, e] = await Promise.all([getSeatUsage(organizationId), getEntitlements(organizationId)]);
  const plan = planFor(e.planId);

  return Response.json({
    planStatus: usage.planStatus,
    trialEndsAt: usage.trialEndsAt,
    subscriptionId: usage.subscriptionId,
    seatLimit: usage.seatLimit,
    seatsUsed: usage.used,
    members: usage.members,
    pendingInvites: usage.pendingInvites,
    pricePerSeatInr: plan.monthlyPricePerSeatInr,
    monthlyTotalInr: usage.seatLimit * plan.monthlyPricePerSeatInr,
    blockedReason: planBlockReason(usage),
    // False until PayU keys are set: changes are then free and immediate.
    paymentsEnabled: paymentsEnabled(),
    // Plans and billing cycles.
    plan: { id: plan.id, name: plan.name },
    effectivePlan: { id: e.effectivePlanId, name: planFor(e.effectivePlanId).name },
    billingCycle: e.billingCycle,
    periodPricePerSeatInr: pricePerSeatInr(plan, e.billingCycle),
    periodTotalInr: periodTotalInr(plan, e.billingCycle, usage.seatLimit),
    currentPeriodEnd: e.currentPeriodEnd,
    cancelAtPeriodEnd: e.cancelAtPeriodEnd,
    access: e.access,
    limits: e.limits,
    // Invoices issued this calendar month (India) against the plan's cap (null = no cap).
    invoiceUsage: await invoiceUsage(organizationId, e),
  });
});
