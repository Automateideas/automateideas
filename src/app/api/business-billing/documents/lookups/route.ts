import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { catalogueForDocuments, customerForDocuments, invoicesForNotes } from "@/lib/business-billing/documents/service";
import { getTaxSettings } from "@/lib/business-billing/tax-settings";

// GET /api/business-billing/documents/lookups?customerId= (billing.view):
// what the document editor needs: company tax defaults, and for the chosen
// customer their details, catalogue prices (their price list applied) and
// issued invoices (for credit/debit notes).
export const GET = route(async (request: Request) => {
  const { organizationId } = await requireBillingPermission("billing.view");
  const customerId = new URL(request.url).searchParams.get("customerId");
  const tax = await getTaxSettings(organizationId);
  const customer = customerId ? await customerForDocuments(organizationId, customerId) : null;
  const [catalogue, invoices] = await Promise.all([
    catalogueForDocuments(organizationId, customer?.priceListId ?? null),
    customer ? invoicesForNotes(organizationId, customer.id) : Promise.resolve([]),
  ]);
  return Response.json({
    company: { configured: tax.configured, registered: tax.registered, stateCode: tax.stateCode, pricesIncludeTax: tax.pricesIncludeTax, roundOff: tax.roundOff },
    customer,
    catalogue,
    invoices,
  });
});
