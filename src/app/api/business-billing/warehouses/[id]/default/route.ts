import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { setDefaultWarehouse } from "@/lib/business-billing/inventory/service";

// POST (billing.inventory.manage): make this the default warehouse, used by documents unless another is chosen.
export const POST = route(async (_request: Request, { params }: RouteContext<"/api/business-billing/warehouses/[id]/default">) => {
  const { organizationId, user } = await requireBillingPermission("billing.inventory.manage");
  return Response.json(await setDefaultWarehouse(organizationId, user.id, (await params).id));
});
