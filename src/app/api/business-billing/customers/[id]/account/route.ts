import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { customerAccount } from "@/lib/business-billing/payments/service";

// GET /api/business-billing/customers/:id/account (billing.view): balance, open invoices and ledger.
export const GET = route(async (_request: Request, { params }: RouteContext<"/api/business-billing/customers/[id]/account">) => {
  const { organizationId } = await requireBillingPermission("billing.view");
  return Response.json(await customerAccount(organizationId, (await params).id));
});
