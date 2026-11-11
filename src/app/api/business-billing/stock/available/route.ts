import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { availableStock, inventorySettings, listWarehouses } from "@/lib/business-billing/inventory/service";

// GET /api/business-billing/stock/available?warehouseId= (billing.view): quantity on hand of
// every tracked product in one warehouse (default when omitted), the warehouses to choose
// from, and whether stock may go negative. Used by the document editor's hints.
export const GET = route(async (request: Request) => {
  const { organizationId } = await requireBillingPermission("billing.view");
  const warehouseId = new URL(request.url).searchParams.get("warehouseId") || null;
  const [available, warehouses, settings] = await Promise.all([availableStock(organizationId, warehouseId), listWarehouses(organizationId), inventorySettings(organizationId)]);
  return Response.json({
    ...available,
    warehouses: warehouses.map((w) => ({ id: w.id, code: w.code, name: w.name, isDefault: w.isDefault })),
    allowNegativeStock: settings.allowNegativeStock,
  });
});
