import { SUBSCRIPTION_ROLES, requireOrgRole, route } from "@/lib/access";
import { GRACE_DAYS, PLANS, YEARLY_MONTHS_CHARGED, pricePerSeatInr } from "@/lib/subscription-billing/plans";

// GET /api/subscription/plans: the plan catalogue with prices (owner/admin only).
export const GET = route(async () => {
  await requireOrgRole(SUBSCRIPTION_ROLES);
  return Response.json({
    yearlyMonthsCharged: YEARLY_MONTHS_CHARGED,
    graceDays: GRACE_DAYS,
    plans: Object.values(PLANS).map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      prices: { monthly: pricePerSeatInr(p, "monthly"), yearly: pricePerSeatInr(p, "yearly") },
      features: p.features,
      limits: p.limits,
    })),
  });
});
