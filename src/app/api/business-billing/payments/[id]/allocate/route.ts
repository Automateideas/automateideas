import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { allocatePayment } from "@/lib/business-billing/payments/service";
import { readAllocations } from "@/lib/business-billing/payments/validation";
import { invalid } from "@/lib/business-billing/records";
import { body } from "@/lib/business-billing/route-helpers";

// POST { allocations: [{ invoiceId, amount }] } (billing.payments.manage): apply a payment's advance to invoices.
export const POST = route(async (request: Request, { params }: RouteContext<"/api/business-billing/payments/[id]/allocate">) => {
  const { organizationId, user } = await requireBillingPermission("billing.payments.manage");
  const errors: Record<string, string> = {};
  const allocations = readAllocations((await body(request)).allocations, errors);
  if (Object.keys(errors).length) invalid(errors);
  return Response.json(await allocatePayment(organizationId, user.id, (await params).id, allocations));
});
