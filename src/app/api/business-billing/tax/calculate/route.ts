import { APIError } from "better-auth/api";

import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { invalid } from "@/lib/business-billing/records";
import { body } from "@/lib/business-billing/route-helpers";
import { TaxInputError, calculateGst } from "@/lib/business-billing/tax/gst";
import { parseTaxRequest } from "@/lib/business-billing/tax/request";
import { sellerTaxProfile } from "@/lib/business-billing/tax-settings";
import { withTenant } from "@/lib/business-billing/tenant-db";

// POST /api/business-billing/tax/calculate (billing.view): GST for a set of
// lines, using the company's own state, registration and round-off setting.
// Nothing is saved. Amounts in: rupees. Amounts out: paise.
export const POST = route(async (request: Request) => {
  const { organizationId } = await requireBillingPermission("billing.view");
  const raw = await body(request);
  const seller = await withTenant(organizationId, (tx) => sellerTaxProfile(tx, organizationId));
  if (!seller.configured) {
    throw new APIError("BAD_REQUEST", { code: "COMPANY_NOT_SET_UP", message: "Save your company details first (Billing → Settings)." });
  }

  const parsed = parseTaxRequest(raw, {
    sellerStateCode: seller.stateCode,
    sellerRegistered: seller.registered,
    roundOff: seller.roundOff,
    defaultPricesIncludeTax: seller.pricesIncludeTax,
  });
  if (!parsed.ok) invalid(parsed.errors);

  try {
    return Response.json({ ...calculateGst(parsed.input), sellerRegistered: seller.registered, sellerStateCode: seller.stateCode });
  } catch (e) {
    if (e instanceof TaxInputError) invalid({ [e.field]: e.message }, e.message);
    throw e;
  }
});
