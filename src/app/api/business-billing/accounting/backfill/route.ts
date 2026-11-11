import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { backfillBooks, backfillStatus } from "@/lib/business-billing/accounting/service";

// GET /api/business-billing/accounting/backfill (billing.reports.view): how many earlier
// records (from before accounting) aren't in the books yet.
export const GET = route(async () => {
  const { organizationId } = await requireBillingPermission("billing.reports.view");
  return Response.json(await backfillStatus(organizationId));
});

// POST (billing.accounting.manage): post them, dated as they happened. Safe to repeat.
export const POST = route(async () => {
  const { organizationId, user } = await requireBillingPermission("billing.accounting.manage");
  return Response.json(await backfillBooks(organizationId, user.id));
});
