import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { journalLookups } from "@/lib/business-billing/accounting/service";

// GET /api/business-billing/accounting/journal/lookups (billing.reports.view):
// accounts, customers and suppliers for the entry form and the ledger picker.
export const GET = route(async () => {
  const { organizationId } = await requireBillingPermission("billing.reports.view");
  return Response.json(await journalLookups(organizationId));
});
