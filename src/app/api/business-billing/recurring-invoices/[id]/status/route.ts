import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { invalid } from "@/lib/business-billing/records";
import { setRecurringStatus } from "@/lib/business-billing/recurring/service";
import { body } from "@/lib/business-billing/route-helpers";

// POST { action: "pause" | "resume" | "end" } (billing.invoices.manage). Resuming skips dates missed while paused.
export const POST = route(async (request: Request, { params }: RouteContext<"/api/business-billing/recurring-invoices/[id]/status">) => {
  const { organizationId, user } = await requireBillingPermission("billing.invoices.manage");
  const { action } = await body(request);
  if (action !== "pause" && action !== "resume" && action !== "end") invalid({ action: "Choose pause, resume or end." });
  return Response.json(await setRecurringStatus(organizationId, user.id, (await params).id, action));
});
