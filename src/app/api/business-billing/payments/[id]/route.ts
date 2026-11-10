import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { getPayment } from "@/lib/business-billing/payments/service";
import { editAccess } from "@/lib/business-billing/route-helpers";

// GET /api/business-billing/payments/:id: the receipt, its allocations and refunds (billing.view).
export const GET = route(async (_request: Request, { params }: RouteContext<"/api/business-billing/payments/[id]">) => {
  const ctx = await requireBillingPermission("billing.view");
  const payment = await getPayment(ctx.organizationId, (await params).id);
  return Response.json({ ...payment, ...editAccess(ctx, "billing.payments.manage") });
});
