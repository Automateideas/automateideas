import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { balanceSheet } from "@/lib/business-billing/accounting/service";

import { asOfFrom } from "../_shared";

// GET /api/business-billing/accounting/balance-sheet?asOf= (billing.reports.view).
export const GET = route(async (request: Request) => {
  const { organizationId } = await requireBillingPermission("billing.reports.view");
  return Response.json(await balanceSheet(organizationId, asOfFrom(request)));
});
