import { SUBSCRIPTION_ROLES, readJson, requireOrgRole, route } from "@/lib/access";
import { changeSubscription } from "@/lib/subscription-billing/change";

// POST /api/subscription/seats { seats } (owner/admin only).
// Changes only the seat count, keeping the plan and billing cycle.
// Same rules as /api/subscription/change.
export const POST = route(async (request: Request) => {
  const { organizationId, user } = await requireOrgRole(SUBSCRIPTION_ROLES);
  const body = await readJson<{ seats: number }>(request);
  return Response.json(await changeSubscription(organizationId, user, { seats: body.seats }));
});
