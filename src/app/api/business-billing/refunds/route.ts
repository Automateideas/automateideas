import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { listRefunds, recordRefund } from "@/lib/business-billing/payments/service";
import { readIdempotencyKey, validateRefund } from "@/lib/business-billing/payments/validation";
import { parseListQuery } from "@/lib/business-billing/records";
import { body, editAccess, valuesOrThrow } from "@/lib/business-billing/route-helpers";

// GET /api/business-billing/refunds?q=&status=&customerId=&page= (billing.view).
export const GET = route(async (request: Request) => {
  const ctx = await requireBillingPermission("billing.view");
  const customerId = new URL(request.url).searchParams.get("customerId");
  const list = await listRefunds(ctx.organizationId, { ...parseListQuery(request.url), customerId });
  return Response.json({ ...list, ...editAccess(ctx, "billing.payments.manage") });
});

// POST (billing.payments.manage): refund an unused advance (paymentId) or an
// over-credited invoice (creditNoteId). Idempotency-Key header as for payments.
export const POST = route(async (request: Request) => {
  const { organizationId, user } = await requireBillingPermission("billing.payments.manage");
  const values = valuesOrThrow(validateRefund(await body(request)));
  const refund = await recordRefund(organizationId, user.id, values, readIdempotencyKey(request.headers.get("idempotency-key")));
  return Response.json(refund, { status: refund.replayed ? 200 : 201 });
});
