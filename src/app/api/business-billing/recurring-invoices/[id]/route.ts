import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { getRecurring, updateRecurring } from "@/lib/business-billing/recurring/service";
import { validateSchedule } from "@/lib/business-billing/recurring/schedule";
import { body, editAccess, valuesOrThrow } from "@/lib/business-billing/route-helpers";

// GET (billing.view): the schedule, its items and the invoices it created.
export const GET = route(async (_request: Request, { params }: RouteContext<"/api/business-billing/recurring-invoices/[id]">) => {
  const ctx = await requireBillingPermission("billing.view");
  return Response.json({ ...(await getRecurring(ctx.organizationId, (await params).id)), ...editAccess(ctx, "billing.invoices.manage") });
});

// PUT { name, frequency, interval, startDate, endDate?, maxCount?, dueDays?, autoIssue, autoEmail }
// (billing.invoices.manage). The next date is recomputed and never falls in the past.
export const PUT = route(async (request: Request, { params }: RouteContext<"/api/business-billing/recurring-invoices/[id]">) => {
  const { organizationId, user } = await requireBillingPermission("billing.invoices.manage");
  const values = valuesOrThrow(validateSchedule(await body(request)));
  return Response.json(await updateRecurring(organizationId, user.id, (await params).id, values));
});
