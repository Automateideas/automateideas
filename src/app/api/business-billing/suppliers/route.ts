import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { validateSupplier } from "@/lib/business-billing/contacts-validation";
import { parseListQuery } from "@/lib/business-billing/records";
import { body, editAccess, valuesOrThrow } from "@/lib/business-billing/route-helpers";
import { createSupplier, listSuppliers } from "@/lib/business-billing/suppliers";

// GET /api/business-billing/suppliers?q=&status=&page=: list (billing.view).
export const GET = route(async (request: Request) => {
  const ctx = await requireBillingPermission("billing.view");
  const list = await listSuppliers(ctx.organizationId, parseListQuery(request.url));
  return Response.json({ ...list, ...editAccess(ctx, "billing.purchases.manage") });
});

// POST: create (billing.purchases.manage).
export const POST = route(async (request: Request) => {
  const { organizationId, user } = await requireBillingPermission("billing.purchases.manage");
  const values = valuesOrThrow(validateSupplier(await body(request)));
  return Response.json(await createSupplier(organizationId, user.id, values), { status: 201 });
});
