import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { profitAndLoss } from "@/lib/business-billing/accounting/service";

import { periodFrom } from "../_shared";

// GET /api/business-billing/accounting/profit-loss?from=&to= (billing.reports.view).
// Defaults to this financial year to date.
export const GET = route(async (request: Request) => {
  const { organizationId } = await requireBillingPermission("billing.reports.view");
  return Response.json(await profitAndLoss(organizationId, await periodFrom(request, organizationId)));
});
