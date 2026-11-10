import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { validatePriceList } from "@/lib/business-billing/catalogue-validation";
import { getPriceList, updatePriceList } from "@/lib/business-billing/price-lists";
import { body, editAccess, valuesOrThrow } from "@/lib/business-billing/route-helpers";

type Ctx = RouteContext<"/api/business-billing/price-lists/[id]">;

// GET /api/business-billing/price-lists/:id: the list and its items (billing.view).
export const GET = route(async (_request: Request, { params }: Ctx) => {
  const ctx = await requireBillingPermission("billing.view");
  const list = await getPriceList(ctx.organizationId, (await params).id);
  return Response.json({ ...list, ...editAccess(ctx, "billing.catalog.manage") });
});

// PUT: rename or make default (billing.catalog.manage).
export const PUT = route(async (request: Request, { params }: Ctx) => {
  const { organizationId, user } = await requireBillingPermission("billing.catalog.manage");
  const values = valuesOrThrow(validatePriceList(await body(request)));
  return Response.json(await updatePriceList(organizationId, user.id, (await params).id, values));
});
