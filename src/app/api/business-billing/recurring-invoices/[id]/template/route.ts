import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { FieldReader } from "@/lib/business-billing/fields";
import { invalid } from "@/lib/business-billing/records";
import { replaceTemplate } from "@/lib/business-billing/recurring/service";
import { body } from "@/lib/business-billing/route-helpers";

// POST { invoiceId } (billing.invoices.manage): bill these items from now on, copied from
// another invoice of the same customer.
export const POST = route(async (request: Request, { params }: RouteContext<"/api/business-billing/recurring-invoices/[id]/template">) => {
  const { organizationId, user } = await requireBillingPermission("billing.invoices.manage");
  const r = new FieldReader(await body(request));
  const invoiceId = r.id("invoiceId", "Choose the invoice to copy.");
  if (!r.ok) invalid(r.errors);
  return Response.json(await replaceTemplate(organizationId, user.id, (await params).id, invoiceId!));
});
