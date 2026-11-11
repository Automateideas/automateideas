import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { receiptEmailDefaults, sendReceiptEmail, validateSend } from "@/lib/business-billing/communication/service";
import { body, valuesOrThrow } from "@/lib/business-billing/route-helpers";

// GET (billing.view): the customer's address for the receipt email dialog.
export const GET = route(async (_request: Request, { params }: RouteContext<"/api/business-billing/payments/[id]/email">) => {
  const { organizationId } = await requireBillingPermission("billing.view");
  return Response.json(await receiptEmailDefaults(organizationId, (await params).id));
});

// POST { to, cc?, subject?, message?, attachPdf? } (billing.payments.manage): email the receipt.
export const POST = route(async (request: Request, { params }: RouteContext<"/api/business-billing/payments/[id]/email">) => {
  const { organizationId, user } = await requireBillingPermission("billing.payments.manage");
  const values = valuesOrThrow(validateSend(await body(request)));
  return Response.json(await sendReceiptEmail(organizationId, user.id, (await params).id, values), { status: 201 });
});
