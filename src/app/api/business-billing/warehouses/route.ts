import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { createWarehouse, listWarehouses } from "@/lib/business-billing/inventory/service";
import { validateWarehouse } from "@/lib/business-billing/inventory/validation";
import { body, editAccess, valuesOrThrow } from "@/lib/business-billing/route-helpers";

// GET /api/business-billing/warehouses?status=all (billing.view): warehouses with the
// value of stock in each. A default "Main warehouse" is created on first use.
export const GET = route(async (request: Request) => {
  const ctx = await requireBillingPermission("billing.view");
  const includeArchived = new URL(request.url).searchParams.get("status") === "all";
  return Response.json({ items: await listWarehouses(ctx.organizationId, { includeArchived }), ...editAccess(ctx, "billing.inventory.manage") });
});

// POST { code, name, addressLine1?, city?, stateCode?, postalCode? } (billing.inventory.manage).
export const POST = route(async (request: Request) => {
  const { organizationId, user } = await requireBillingPermission("billing.inventory.manage");
  const values = valuesOrThrow(validateWarehouse(await body(request)));
  return Response.json(await createWarehouse(organizationId, user.id, values), { status: 201 });
});
