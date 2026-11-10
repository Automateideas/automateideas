import { APIError } from "better-auth/api";

import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { partyForDocuments } from "@/lib/business-billing/documents/service";
import { invalid } from "@/lib/business-billing/records";
import { body } from "@/lib/business-billing/route-helpers";
import { TaxInputError, calculateGst } from "@/lib/business-billing/tax/gst";
import { parseTaxRequest } from "@/lib/business-billing/tax/request";
import { sellerTaxProfile } from "@/lib/business-billing/tax-settings";
import { withTenant } from "@/lib/business-billing/tenant-db";

// POST /api/business-billing/tax/calculate (billing.view): GST for a set of
// lines. Nothing is saved. Amounts in: rupees. Amounts out: paise.
// Sales (default): your company is the seller. With `supplierId` (purchases):
// that supplier is the seller and the place of supply is usually yours; under
// reverse charge GST is worked out even if they're unregistered (same rules
// as saving a purchase document).
export const POST = route(async (request: Request) => {
  const { organizationId } = await requireBillingPermission("billing.view");
  const raw = await body(request);
  const company = await withTenant(organizationId, (tx) => sellerTaxProfile(tx, organizationId));
  if (!company.configured) {
    throw new APIError("BAD_REQUEST", { code: "COMPANY_NOT_SET_UP", message: "Save your company details first (Billing → Settings)." });
  }

  let sellerStateCode = company.stateCode;
  let sellerRegistered = company.registered;
  if (typeof raw.supplierId === "string" && raw.supplierId) {
    const supplier = await partyForDocuments(organizationId, "purchase-bills", raw.supplierId);
    const reverseCharge = raw.reverseCharge === true;
    sellerRegistered = !!supplier.gstin || reverseCharge;
    sellerStateCode = supplier.stateCode ?? (reverseCharge ? company.stateCode : null);
  }

  const parsed = parseTaxRequest(raw, {
    sellerStateCode,
    sellerRegistered,
    roundOff: company.roundOff,
    defaultPricesIncludeTax: company.pricesIncludeTax,
  });
  if (!parsed.ok) invalid(parsed.errors);

  try {
    return Response.json({ ...calculateGst(parsed.input), sellerRegistered, sellerStateCode });
  } catch (e) {
    if (e instanceof TaxInputError) invalid({ [e.field]: e.message }, e.message);
    throw e;
  }
});
