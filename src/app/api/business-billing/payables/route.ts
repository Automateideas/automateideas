import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { payablesReport } from "@/lib/business-billing/payments/supplier-payments";

// GET /api/business-billing/payables (billing.view): unpaid bills by supplier, aged by due date.
export const GET = route(async () => {
  const { organizationId } = await requireBillingPermission("billing.view");
  return Response.json(await payablesReport(organizationId));
});
