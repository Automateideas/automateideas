import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { editAccess } from "@/lib/business-billing/route-helpers";
import { refreshTemplates } from "@/lib/business-billing/whatsapp/service";

// POST (billing.settings.manage): check the message templates in the company's own WhatsApp
// account again (e.g. after Meta approves them) and create any that are missing.
export const POST = route(async () => {
  const ctx = await requireBillingPermission("billing.settings.manage");
  return Response.json({ ...(await refreshTemplates(ctx.organizationId, ctx.user.id)), ...editAccess(ctx, "billing.settings.manage") });
});
