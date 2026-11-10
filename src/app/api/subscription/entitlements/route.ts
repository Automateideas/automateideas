import { requireOrgRole, route } from "@/lib/access";
import { ORG_ROLES } from "@/lib/roles";
import { getEntitlements } from "@/lib/subscription-billing/entitlements";
import { planFor } from "@/lib/subscription-billing/plans";

// GET /api/subscription/entitlements: what this workspace's plan allows
// (every member). No prices or payment details. Pages use it to hide what's
// off; the server checks the same rules on every request.
export const GET = route(async () => {
  const { organizationId } = await requireOrgRole(ORG_ROLES);
  const e = await getEntitlements(organizationId);
  return Response.json({
    plan: { id: e.effectivePlanId, name: planFor(e.effectivePlanId).name },
    features: e.features,
    limits: e.limits,
    access: e.access,
  });
});
