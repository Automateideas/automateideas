import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { accountLedger } from "@/lib/business-billing/accounting/service";
import { invalid } from "@/lib/business-billing/records";

import { periodFrom } from "../_shared";

// GET /api/business-billing/accounting/ledger?accountId=&from=&to=&customerId=&supplierId=
// (billing.reports.view): an account's entries with opening, running and closing balances.
export const GET = route(async (request: Request) => {
  const { organizationId } = await requireBillingPermission("billing.reports.view");
  const p = new URL(request.url).searchParams;
  const accountId = p.get("accountId");
  if (!accountId) invalid({ accountId: "Choose an account." });
  const range = await periodFrom(request, organizationId);
  return Response.json(await accountLedger(organizationId, accountId, range, { customerId: p.get("customerId"), supplierId: p.get("supplierId") }));
});
