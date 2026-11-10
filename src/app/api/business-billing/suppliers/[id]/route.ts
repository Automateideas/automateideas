import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { validateSupplier } from "@/lib/business-billing/contacts-validation";
import { body, editAccess, valuesOrThrow } from "@/lib/business-billing/route-helpers";
import { getSupplier, updateSupplier } from "@/lib/business-billing/suppliers";

type Ctx = RouteContext<"/api/business-billing/suppliers/[id]">;

// GET /api/business-billing/suppliers/:id (billing.view).
export const GET = route(async (_request: Request, { params }: Ctx) => {
  const ctx = await requireBillingPermission("billing.view");
  const supplier = await getSupplier(ctx.organizationId, (await params).id);
  return Response.json({ ...supplier, ...editAccess(ctx, "billing.purchases.manage") });
});

// PUT: replace the supplier's details (billing.purchases.manage).
export const PUT = route(async (request: Request, { params }: Ctx) => {
  const { organizationId, user } = await requireBillingPermission("billing.purchases.manage");
  const values = valuesOrThrow(validateSupplier(await body(request)));
  return Response.json(await updateSupplier(organizationId, user.id, (await params).id, values));
});
