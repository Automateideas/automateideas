import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { productStock } from "@/lib/business-billing/inventory/service";

// GET /api/business-billing/stock/:productId?warehouseId= (billing.view): a product's stock by
// warehouse and its movement history, newest first.
export const GET = route(async (request: Request, { params }: RouteContext<"/api/business-billing/stock/[productId]">) => {
  const { organizationId } = await requireBillingPermission("billing.view");
  const warehouseId = new URL(request.url).searchParams.get("warehouseId") || null;
  return Response.json(await productStock(organizationId, (await params).productId, { warehouseId }));
});
