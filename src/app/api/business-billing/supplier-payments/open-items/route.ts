import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { billsToPay } from "@/lib/business-billing/payments/supplier-payments";
import { invalid } from "@/lib/business-billing/records";

// GET /api/business-billing/supplier-payments/open-items?supplierId= (billing.view): a supplier's unpaid bills.
export const GET = route(async (request: Request) => {
  const { organizationId } = await requireBillingPermission("billing.view");
  const supplierId = new URL(request.url).searchParams.get("supplierId");
  if (!supplierId) invalid({ supplierId: "Choose a supplier." });
  return Response.json({ bills: await billsToPay(organizationId, supplierId!) });
});
