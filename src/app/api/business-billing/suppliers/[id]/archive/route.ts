import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { archivedFlag } from "@/lib/business-billing/route-helpers";
import { setSupplierArchived } from "@/lib/business-billing/suppliers";

// POST /api/business-billing/suppliers/:id/archive { archived } (billing.purchases.manage).
export const POST = route(async (request: Request, { params }: RouteContext<"/api/business-billing/suppliers/[id]/archive">) => {
  const { organizationId, user } = await requireBillingPermission("billing.purchases.manage");
  return Response.json(await setSupplierArchived(organizationId, user.id, (await params).id, await archivedFlag(request)));
});
