import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { invoicesToPay, refundableCreditNotes } from "@/lib/business-billing/payments/service";
import { invalid } from "@/lib/business-billing/records";

// GET /api/business-billing/payments/open-items?customerId= (billing.view):
// a customer's unpaid invoices (with what each still owes) and refundable credit notes.
export const GET = route(async (request: Request) => {
  const { organizationId } = await requireBillingPermission("billing.view");
  const customerId = new URL(request.url).searchParams.get("customerId");
  if (!customerId) invalid({ customerId: "Choose a customer." });
  const [invoices, creditNotes] = await Promise.all([invoicesToPay(organizationId, customerId!), refundableCreditNotes(organizationId, customerId!)]);
  return Response.json({ invoices, creditNotes });
});
