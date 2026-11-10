import { SUBSCRIPTION_ROLES, readJson, requireOrgRole, route } from "@/lib/access";
import { changeSubscription } from "@/lib/subscription-billing/change";

// POST /api/subscription/change { planId?, billingCycle?, seats } (owner/admin only).
// Switch plan or cycle, change seats, or renew. With payments off it applies
// at once; with payments on it returns a PayU checkout and the webhook applies it.
export const POST = route(async (request: Request) => {
  const { organizationId, user } = await requireOrgRole(SUBSCRIPTION_ROLES);
  const body = await readJson<{ planId: string; billingCycle: string; seats: number }>(request);
  return Response.json(
    await changeSubscription(organizationId, user, {
      planId: body.planId,
      billingCycle: body.billingCycle,
      seats: body.seats,
    }),
  );
});
