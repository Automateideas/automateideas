import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { sendReminderNow } from "@/lib/business-billing/communication/service";
import { invalid } from "@/lib/business-billing/records";
import { body } from "@/lib/business-billing/route-helpers";

import { slugOf } from "../../../_shared";

// POST { channel?: "email" | "whatsapp" } (billing.invoices.manage): send a payment reminder for
// an unpaid invoice now, whatever the reminder schedule and the customer's automatic-reminder setting.
export const POST = route(async (request: Request, { params }: RouteContext<"/api/business-billing/documents/[type]/[id]/remind">) => {
  const { type, id } = await params;
  if (slugOf(type) !== "invoices") invalid({ type: "Only invoices get payment reminders." });
  const { organizationId, user } = await requireBillingPermission("billing.invoices.manage");
  const raw = await body(request).catch(() => ({}) as Record<string, unknown>);
  return Response.json(await sendReminderNow(organizationId, user.id, id, raw.channel === "whatsapp" ? "whatsapp" : "email"), { status: 201 });
});
