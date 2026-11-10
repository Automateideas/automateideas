import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { supplierAccount } from "@/lib/business-billing/payments/supplier-payments";

// GET /api/business-billing/suppliers/:id/account (billing.view): what you owe, open bills and ledger.
export const GET = route(async (_request: Request, { params }: RouteContext<"/api/business-billing/suppliers/[id]/account">) => {
  const { organizationId } = await requireBillingPermission("billing.view");
  return Response.json(await supplierAccount(organizationId, (await params).id));
});
