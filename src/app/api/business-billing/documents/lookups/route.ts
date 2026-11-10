import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { catalogueForDocuments, partyForDocuments, sourcesForNotes } from "@/lib/business-billing/documents/service";
import { type DocumentSlug, isDocumentSlug } from "@/lib/business-billing/documents/types";
import { getTaxSettings } from "@/lib/business-billing/tax-settings";

// GET /api/business-billing/documents/lookups?type=&customerId=|supplierId= (billing.view):
// what the document editor needs: company tax defaults, and for the chosen
// customer or supplier their details, catalogue prices (sales: their price
// list; purchases: purchase prices) and the invoices/bills a note or return
// can adjust. `type` defaults to invoices.
export const GET = route(async (request: Request) => {
  const { organizationId } = await requireBillingPermission("billing.view");
  const sp = new URL(request.url).searchParams;
  const t = sp.get("type") ?? "invoices";
  const slug: DocumentSlug = isDocumentSlug(t) ? t : "invoices";
  const purchase = slug.startsWith("purchase-");
  const partyId = purchase ? sp.get("supplierId") : sp.get("customerId");
  const tax = await getTaxSettings(organizationId);
  const party = partyId ? await partyForDocuments(organizationId, slug, partyId) : null;
  const [catalogue, sources] = await Promise.all([
    catalogueForDocuments(organizationId, party?.priceListId ?? null, purchase ? "purchase" : "sale"),
    party ? sourcesForNotes(organizationId, slug, party.id) : Promise.resolve([]),
  ]);
  return Response.json({
    company: { configured: tax.configured, registered: tax.registered, stateCode: tax.stateCode, pricesIncludeTax: tax.pricesIncludeTax, roundOff: tax.roundOff },
    party,
    // Kept for older callers.
    customer: purchase ? null : party,
    catalogue,
    /** Invoices (sales) or bills (purchases) a note or return can adjust. */
    invoices: sources,
  });
});
