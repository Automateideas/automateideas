import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { emailMode } from "@/lib/business-billing/communication/email";
import { communicationSettings, setCommunicationSettings } from "@/lib/business-billing/communication/service";
import { validateCommunication } from "@/lib/business-billing/communication/settings";
import { body, editAccess, valuesOrThrow } from "@/lib/business-billing/route-helpers";

// GET (billing.view): reminder schedule and automatic receipts, and whether email works on this server.
export const GET = route(async () => {
  const ctx = await requireBillingPermission("billing.view");
  return Response.json({ ...(await communicationSettings(ctx.organizationId)), emailMode: emailMode(), ...editAccess(ctx, "billing.settings.manage") });
});

// PUT { reminders: { enabled, beforeDays, onDueDate, afterEveryDays, maxAfter, sendHour }, autoReceiptEmail }
// (billing.settings.manage).
export const PUT = route(async (request: Request) => {
  const ctx = await requireBillingPermission("billing.settings.manage");
  const values = valuesOrThrow(validateCommunication(await body(request)));
  return Response.json({ ...(await setCommunicationSettings(ctx.organizationId, ctx.user.id, values)), emailMode: emailMode(), ...editAccess(ctx, "billing.settings.manage") });
});
