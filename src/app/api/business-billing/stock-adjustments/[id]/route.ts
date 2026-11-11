import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { getAdjustment } from "@/lib/business-billing/inventory/service";
import { editAccess } from "@/lib/business-billing/route-helpers";

// GET /api/business-billing/stock-adjustments/:id (billing.view).
export const GET = route(async (_request: Request, { params }: RouteContext<"/api/business-billing/stock-adjustments/[id]">) => {
  const ctx = await requireBillingPermission("billing.view");
  return Response.json({ ...(await getAdjustment(ctx.organizationId, (await params).id)), ...editAccess(ctx, "billing.inventory.manage") });
});
