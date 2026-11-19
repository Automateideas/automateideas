import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { editAccess } from "@/lib/business-billing/route-helpers";
import { disconnectOwnNumber, whatsappStatus } from "@/lib/business-billing/whatsapp/service";

// GET (billing.view): WhatsApp sending for this company: the shared Automate Ideas number
// (option A), the company's own connected number (option B), template approval and this
// month's use of the shared number. Never returns tokens.
export const GET = route(async () => {
  const ctx = await requireBillingPermission("billing.view");
  return Response.json({ ...(await whatsappStatus(ctx.organizationId)), ...editAccess(ctx, "billing.settings.manage") });
});

// DELETE (billing.settings.manage): disconnect the company's own number.
export const DELETE = route(async () => {
  const ctx = await requireBillingPermission("billing.settings.manage");
  return Response.json({ ...(await disconnectOwnNumber(ctx.organizationId)), ...editAccess(ctx, "billing.settings.manage") });
});
