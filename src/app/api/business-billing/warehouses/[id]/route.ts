import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { updateWarehouse } from "@/lib/business-billing/inventory/service";
import { validateWarehouse } from "@/lib/business-billing/inventory/validation";
import { body, valuesOrThrow } from "@/lib/business-billing/route-helpers";

// PUT { code, name, addressLine1?, city?, stateCode?, postalCode? } (billing.inventory.manage).
export const PUT = route(async (request: Request, { params }: RouteContext<"/api/business-billing/warehouses/[id]">) => {
  const { organizationId, user } = await requireBillingPermission("billing.inventory.manage");
  const values = valuesOrThrow(validateWarehouse(await body(request)));
  return Response.json(await updateWarehouse(organizationId, user.id, (await params).id, values));
});
