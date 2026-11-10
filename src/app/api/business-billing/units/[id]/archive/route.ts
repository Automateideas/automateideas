import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { setUnitArchived } from "@/lib/business-billing/catalogue";
import { archivedFlag } from "@/lib/business-billing/route-helpers";

// POST /api/business-billing/units/:id/archive { archived } (billing.catalog.manage).
// Archived, never deleted: documents keep pointing at it.
export const POST = route(async (request: Request, { params }: RouteContext<"/api/business-billing/units/[id]/archive">) => {
  const { organizationId, user } = await requireBillingPermission("billing.catalog.manage");
  return Response.json(await setUnitArchived(organizationId, user.id, (await params).id, await archivedFlag(request)));
});
