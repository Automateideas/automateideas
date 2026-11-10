import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { body, editAccess, valuesOrThrow } from "@/lib/business-billing/route-helpers";
import { companyGstin, getTaxSettings, saveTaxSettings } from "@/lib/business-billing/tax-settings";
import { validateTaxSettings } from "@/lib/business-billing/tax-settings-validation";

// GET /api/business-billing/tax-settings (billing.view): state, GST-inclusive default, round-off, numbering.
export const GET = route(async () => {
  const ctx = await requireBillingPermission("billing.view");
  const settings = await getTaxSettings(ctx.organizationId);
  return Response.json({ ...settings, ...editAccess(ctx, "billing.settings.manage") });
});

// PUT (billing.settings.manage): { stateCode, pricesIncludeTax, roundOff }.
export const PUT = route(async (request: Request) => {
  const { organizationId, user } = await requireBillingPermission("billing.settings.manage");
  const values = valuesOrThrow(validateTaxSettings(await body(request), await companyGstin(organizationId)));
  return Response.json({ ...(await saveTaxSettings(organizationId, user.id, values)), canEdit: true, readOnlyReason: null });
});
