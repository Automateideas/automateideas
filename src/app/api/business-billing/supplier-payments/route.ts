import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { listSupplierPayments, recordSupplierPayment } from "@/lib/business-billing/payments/supplier-payments";
import { readIdempotencyKey, validateSupplierPayment } from "@/lib/business-billing/payments/validation";
import { parseListQuery } from "@/lib/business-billing/records";
import { body, editAccess, valuesOrThrow } from "@/lib/business-billing/route-helpers";

// GET /api/business-billing/supplier-payments?q=&status=active|archived|all&supplierId=&page= (billing.view).
export const GET = route(async (request: Request) => {
  const ctx = await requireBillingPermission("billing.view");
  const supplierId = new URL(request.url).searchParams.get("supplierId");
  const list = await listSupplierPayments(ctx.organizationId, { ...parseListQuery(request.url), supplierId });
  return Response.json({ ...list, ...editAccess(ctx, "billing.purchases.manage") });
});

// POST (billing.purchases.manage): record a payment made to a supplier, optionally against
// their bills: { supplierId, paymentDate, amount, method, reference, allocations: [{ billId, amount }] }.
// Idempotency-Key header: a repeat returns the payment already recorded (200).
export const POST = route(async (request: Request) => {
  const { organizationId, user } = await requireBillingPermission("billing.purchases.manage");
  const values = valuesOrThrow(validateSupplierPayment(await body(request)));
  const payment = await recordSupplierPayment(organizationId, user.id, values, readIdempotencyKey(request.headers.get("idempotency-key")));
  return Response.json(payment, { status: payment.replayed ? 200 : 201 });
});
