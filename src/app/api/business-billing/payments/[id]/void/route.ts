import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { FieldReader } from "@/lib/business-billing/fields";
import { voidPayment } from "@/lib/business-billing/payments/service";
import { invalid } from "@/lib/business-billing/records";
import { body } from "@/lib/business-billing/route-helpers";

// POST { reason } (billing.payments.manage): void a payment. Its invoices owe again; the receipt number stays used.
export const POST = route(async (request: Request, { params }: RouteContext<"/api/business-billing/payments/[id]/void">) => {
  const { organizationId, user } = await requireBillingPermission("billing.payments.manage");
  const r = new FieldReader(await body(request));
  const reason = r.text("reason", 300, "Say why it's being voided, e.g. Cheque bounced.");
  if (!r.ok) invalid(r.errors);
  return Response.json(await voidPayment(organizationId, user.id, (await params).id, reason!));
});
