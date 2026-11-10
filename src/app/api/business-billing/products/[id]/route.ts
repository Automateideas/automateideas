import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { getProduct, updateProduct } from "@/lib/business-billing/catalogue";
import { validateProduct } from "@/lib/business-billing/catalogue-validation";
import { body, editAccess, valuesOrThrow } from "@/lib/business-billing/route-helpers";

type Ctx = RouteContext<"/api/business-billing/products/[id]">;

// GET /api/business-billing/products/:id (billing.view).
export const GET = route(async (_request: Request, { params }: Ctx) => {
  const ctx = await requireBillingPermission("billing.view");
  const item = await getProduct(ctx.organizationId, (await params).id);
  return Response.json({ ...item, ...editAccess(ctx, "billing.catalog.manage") });
});

// PUT: replace its details (billing.catalog.manage).
export const PUT = route(async (request: Request, { params }: Ctx) => {
  const { organizationId, user } = await requireBillingPermission("billing.catalog.manage");
  const values = valuesOrThrow(validateProduct(await body(request)));
  return Response.json(await updateProduct(organizationId, user.id, (await params).id, values));
});
