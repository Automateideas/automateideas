import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { createUnit, listUnits } from "@/lib/business-billing/catalogue";
import { validateUnit } from "@/lib/business-billing/catalogue-validation";
import { parseListQuery } from "@/lib/business-billing/records";
import { body, editAccess, valuesOrThrow } from "@/lib/business-billing/route-helpers";

// GET /api/business-billing/units?status=active|archived|all (billing.view).
export const GET = route(async (request: Request) => {
  const ctx = await requireBillingPermission("billing.view");
  const items = await listUnits(ctx.organizationId, parseListQuery(request.url).status);
  return Response.json({ items, ...editAccess(ctx, "billing.catalog.manage") });
});

// POST: create (billing.catalog.manage).
export const POST = route(async (request: Request) => {
  const { organizationId, user } = await requireBillingPermission("billing.catalog.manage");
  const values = valuesOrThrow(validateUnit(await body(request)));
  return Response.json(await createUnit(organizationId, user.id, values), { status: 201 });
});
