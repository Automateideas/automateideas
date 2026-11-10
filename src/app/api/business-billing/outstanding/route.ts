import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { outstandingReport } from "@/lib/business-billing/payments/service";

// GET /api/business-billing/outstanding (billing.view): unpaid invoices by customer, aged by due date.
export const GET = route(async () => {
  const { organizationId } = await requireBillingPermission("billing.view");
  return Response.json(await outstandingReport(organizationId));
});
