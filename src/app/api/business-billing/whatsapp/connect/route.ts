import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { body, editAccess } from "@/lib/business-billing/route-helpers";
import { connectOwnNumber, validateConnect } from "@/lib/business-billing/whatsapp/service";

// POST { code, wabaId, phoneNumberId, businessId? } (billing.settings.manage): finish Meta's
// Embedded Signup. The code is valid for 30 seconds, so the page posts it straight away.
export const POST = route(async (request: Request) => {
  const ctx = await requireBillingPermission("billing.settings.manage");
  const input = validateConnect(await body(request));
  return Response.json({ ...(await connectOwnNumber(ctx.organizationId, ctx.user.id, input)), ...editAccess(ctx, "billing.settings.manage") }, { status: 201 });
});
