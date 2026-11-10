import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { removePriceListItem } from "@/lib/business-billing/price-lists";

// DELETE /api/business-billing/price-lists/:id/items/:itemId (billing.catalog.manage).
// Removes the special price; the item goes back to its normal price.
export const DELETE = route(
  async (_request: Request, { params }: RouteContext<"/api/business-billing/price-lists/[id]/items/[itemId]">) => {
    const { organizationId } = await requireBillingPermission("billing.catalog.manage");
    const { id, itemId } = await params;
    return Response.json(await removePriceListItem(organizationId, id, itemId));
  },
);
