import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { runNow } from "@/lib/business-billing/recurring/service";

// POST (billing.invoices.manage): create the next scheduled invoice now, dated today
// (issued and emailed if set to). The schedule moves to the date after.
export const POST = route(async (_request: Request, { params }: RouteContext<"/api/business-billing/recurring-invoices/[id]/run">) => {
  const { organizationId, user } = await requireBillingPermission("billing.invoices.manage");
  return Response.json(await runNow(organizationId, user.id, (await params).id), { status: 201 });
});
