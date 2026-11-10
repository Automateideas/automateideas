import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { validatePriceListItem } from "@/lib/business-billing/catalogue-validation";
import { upsertPriceListItem } from "@/lib/business-billing/price-lists";
import { body, valuesOrThrow } from "@/lib/business-billing/route-helpers";

// POST /api/business-billing/price-lists/:id/items { productId | serviceId, price }:
// add an item or change its price (billing.catalog.manage). Returns the whole list.
export const POST = route(async (request: Request, { params }: RouteContext<"/api/business-billing/price-lists/[id]/items">) => {
  const { organizationId, user } = await requireBillingPermission("billing.catalog.manage");
  const values = valuesOrThrow(validatePriceListItem(await body(request)));
  return Response.json(await upsertPriceListItem(organizationId, user.id, (await params).id, values));
});
