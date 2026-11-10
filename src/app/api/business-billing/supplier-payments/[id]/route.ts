import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { getSupplierPayment } from "@/lib/business-billing/payments/supplier-payments";
import { editAccess } from "@/lib/business-billing/route-helpers";

// GET /api/business-billing/supplier-payments/:id (billing.view).
export const GET = route(async (_request: Request, { params }: RouteContext<"/api/business-billing/supplier-payments/[id]">) => {
  const ctx = await requireBillingPermission("billing.view");
  const payment = await getSupplierPayment(ctx.organizationId, (await params).id);
  return Response.json({ ...payment, ...editAccess(ctx, "billing.purchases.manage") });
});
