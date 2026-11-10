import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { allocateSupplierPayment } from "@/lib/business-billing/payments/supplier-payments";
import { readBillAllocations } from "@/lib/business-billing/payments/validation";
import { invalid } from "@/lib/business-billing/records";
import { body } from "@/lib/business-billing/route-helpers";

// POST { allocations: [{ billId, amount }] } (billing.purchases.manage): set an advance against bills.
export const POST = route(async (request: Request, { params }: RouteContext<"/api/business-billing/supplier-payments/[id]/allocate">) => {
  const { organizationId, user } = await requireBillingPermission("billing.purchases.manage");
  const errors: Record<string, string> = {};
  const allocations = readBillAllocations((await body(request)).allocations, errors);
  if (Object.keys(errors).length) invalid(errors);
  return Response.json(await allocateSupplierPayment(organizationId, user.id, (await params).id, allocations));
});
