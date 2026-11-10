import { SUBSCRIPTION_ROLES, requireOrgRole, route } from "@/lib/access";
import { cancelSubscription } from "@/lib/subscription-billing/change";

// POST /api/subscription/cancel (owner/admin only): stop at the end of the
// paid period. Nothing is deleted; the workspace becomes read-only after it.
export const POST = route(async () => {
  const { organizationId } = await requireOrgRole(SUBSCRIPTION_ROLES);
  const e = await cancelSubscription(organizationId);
  return Response.json({ cancelAtPeriodEnd: e.cancelAtPeriodEnd, currentPeriodEnd: e.currentPeriodEnd });
});
