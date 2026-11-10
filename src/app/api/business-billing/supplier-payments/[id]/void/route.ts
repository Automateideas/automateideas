import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { FieldReader } from "@/lib/business-billing/fields";
import { voidSupplierPayment } from "@/lib/business-billing/payments/supplier-payments";
import { invalid } from "@/lib/business-billing/records";
import { body } from "@/lib/business-billing/route-helpers";

// POST { reason } (billing.purchases.manage): void a supplier payment; its bills owe again.
export const POST = route(async (request: Request, { params }: RouteContext<"/api/business-billing/supplier-payments/[id]/void">) => {
  const { organizationId, user } = await requireBillingPermission("billing.purchases.manage");
  const r = new FieldReader(await body(request));
  const reason = r.text("reason", 300, "Say why it's being voided.");
  if (!r.ok) invalid(r.errors);
  return Response.json(await voidSupplierPayment(organizationId, user.id, (await params).id, reason!));
});
