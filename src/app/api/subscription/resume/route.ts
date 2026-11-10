import { SUBSCRIPTION_ROLES, requireOrgRole, route } from "@/lib/access";
import { resumeSubscription } from "@/lib/subscription-billing/change";

// POST /api/subscription/resume (owner/admin only): undo a cancellation.
export const POST = route(async () => {
  const { organizationId } = await requireOrgRole(SUBSCRIPTION_ROLES);
  const e = await resumeSubscription(organizationId);
  return Response.json({ cancelAtPeriodEnd: e.cancelAtPeriodEnd, currentPeriodEnd: e.currentPeriodEnd });
});
