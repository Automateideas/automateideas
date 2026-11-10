import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { markPurchaseOrderReceived } from "@/lib/business-billing/documents/service";
import { invalid } from "@/lib/business-billing/records";

import { actionsFor, slugOf } from "../../../_shared";

// POST (billing.purchases.manage): purchase orders only, sent → received.
export const POST = route(async (_request: Request, { params }: RouteContext<"/api/business-billing/documents/[type]/[id]/received">) => {
  const { type, id } = await params;
  if (slugOf(type) !== "purchase-orders") invalid({ status: "Only purchase orders can be marked received." });
  const ctx = await requireBillingPermission("billing.purchases.manage");
  const doc = await markPurchaseOrderReceived(ctx.organizationId, ctx.user.id, id);
  return Response.json({ ...doc, actions: actionsFor(ctx, doc) });
});
