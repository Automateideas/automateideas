import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { listPayments, recordPayment } from "@/lib/business-billing/payments/service";
import { readIdempotencyKey, validatePayment } from "@/lib/business-billing/payments/validation";
import { parseListQuery } from "@/lib/business-billing/records";
import { body, editAccess, valuesOrThrow } from "@/lib/business-billing/route-helpers";

// GET /api/business-billing/payments?q=&status=active|archived|all&customerId=&page= (billing.view).
// "archived" = void payments.
export const GET = route(async (request: Request) => {
  const ctx = await requireBillingPermission("billing.view");
  const customerId = new URL(request.url).searchParams.get("customerId");
  const list = await listPayments(ctx.organizationId, { ...parseListQuery(request.url), customerId });
  return Response.json({ ...list, ...editAccess(ctx, "billing.payments.manage") });
});

// POST (billing.payments.manage): record a payment received, optionally allocated to invoices.
// Send an Idempotency-Key header (a new random id per submit): repeating the request returns
// the payment already recorded (200) instead of recording it twice.
export const POST = route(async (request: Request) => {
  const { organizationId, user } = await requireBillingPermission("billing.payments.manage");
  const values = valuesOrThrow(validatePayment(await body(request)));
  const payment = await recordPayment(organizationId, user.id, values, readIdempotencyKey(request.headers.get("idempotency-key")));
  return Response.json(payment, { status: payment.replayed ? 200 : 201 });
});
