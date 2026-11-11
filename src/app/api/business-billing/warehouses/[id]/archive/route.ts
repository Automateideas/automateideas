import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { setWarehouseArchived } from "@/lib/business-billing/inventory/service";
import { archivedFlag } from "@/lib/business-billing/route-helpers";

// POST { archived } (billing.inventory.manage). Only empty, non-default warehouses can be archived.
export const POST = route(async (request: Request, { params }: RouteContext<"/api/business-billing/warehouses/[id]/archive">) => {
  const { organizationId, user } = await requireBillingPermission("billing.inventory.manage");
  return Response.json(await setWarehouseArchived(organizationId, user.id, (await params).id, await archivedFlag(request)));
});
