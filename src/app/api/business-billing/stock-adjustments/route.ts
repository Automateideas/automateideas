import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { createAdjustment, listAdjustments } from "@/lib/business-billing/inventory/service";
import { validateAdjustment } from "@/lib/business-billing/inventory/validation";
import { readIdempotencyKey } from "@/lib/business-billing/payments/validation";
import { parseListQuery } from "@/lib/business-billing/records";
import { body, editAccess, valuesOrThrow } from "@/lib/business-billing/route-helpers";

// GET /api/business-billing/stock-adjustments?q=&kind=adjustment|transfer&status=active|archived|all&page=
// (billing.view). status: active = posted, archived = void.
export const GET = route(async (request: Request) => {
  const ctx = await requireBillingPermission("billing.view");
  const p = new URL(request.url).searchParams;
  const kind = p.get("kind") === "adjustment" || p.get("kind") === "transfer" ? (p.get("kind") as "adjustment" | "transfer") : null;
  const q = parseListQuery(request.url);
  // Unlike contacts, the list shows posted and void together unless asked.
  const status = p.get("status") ? q.status : "all";
  return Response.json({ ...(await listAdjustments(ctx.organizationId, { ...q, status, kind })), ...editAccess(ctx, "billing.inventory.manage") });
});

// POST (billing.inventory.manage): an adjustment or transfer
// { date, kind, warehouseId, toWarehouseId?, reason?, notes?, lines: [{ productId, quantity, unitCost?, note? }] }.
// Idempotency-Key header: a repeat returns the one already posted (200).
export const POST = route(async (request: Request) => {
  const { organizationId, user } = await requireBillingPermission("billing.inventory.manage");
  const values = valuesOrThrow(validateAdjustment(await body(request)));
  const a = await createAdjustment(organizationId, user.id, values, readIdempotencyKey(request.headers.get("idempotency-key")));
  return Response.json(a, { status: a.replayed ? 200 : 201 });
});
