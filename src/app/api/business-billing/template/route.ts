import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { body, editAccess, valuesOrThrow } from "@/lib/business-billing/route-helpers";
import { validateTemplate } from "@/lib/business-billing/template";
import { getTemplateSettings, saveTemplate } from "@/lib/business-billing/template-settings";

// GET /api/business-billing/template (billing.view): design, colour, bank/UPI details, defaults, images.
export const GET = route(async () => {
  const ctx = await requireBillingPermission("billing.view");
  return Response.json({ ...(await getTemplateSettings(ctx.organizationId)), ...editAccess(ctx, "billing.settings.manage") });
});

// PUT (billing.settings.manage): the template settings (see lib/business-billing/template.ts).
export const PUT = route(async (request: Request) => {
  const { organizationId, user } = await requireBillingPermission("billing.settings.manage");
  const values = valuesOrThrow(validateTemplate(await body(request)));
  return Response.json({ ...(await saveTemplate(organizationId, user.id, values)), canEdit: true, readOnlyReason: null });
});
