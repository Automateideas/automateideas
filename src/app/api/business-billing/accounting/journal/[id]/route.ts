import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { getJournalEntry } from "@/lib/business-billing/accounting/service";
import { editAccess } from "@/lib/business-billing/route-helpers";

// GET /api/business-billing/accounting/journal/:id (billing.reports.view): an entry and its lines.
export const GET = route(async (_request: Request, { params }: RouteContext<"/api/business-billing/accounting/journal/[id]">) => {
  const ctx = await requireBillingPermission("billing.reports.view");
  return Response.json({ ...(await getJournalEntry(ctx.organizationId, (await params).id)), ...editAccess(ctx, "billing.accounting.manage") });
});
