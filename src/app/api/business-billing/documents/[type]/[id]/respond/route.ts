import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { respondToQuotation } from "@/lib/business-billing/documents/service";
import { QUOTATION_RESPONSES } from "@/lib/business-billing/documents/types";
import { invalid } from "@/lib/business-billing/records";
import { body } from "@/lib/business-billing/route-helpers";

import { actionsFor, slugOf } from "../../../_shared";

// POST { status: "accepted" | "declined" }: quotations only (billing.quotations.manage).
export const POST = route(async (request: Request, { params }: RouteContext<"/api/business-billing/documents/[type]/[id]/respond">) => {
  const { type, id } = await params;
  if (slugOf(type) !== "quotations") invalid({ status: "Only quotations can be accepted or declined." });
  const ctx = await requireBillingPermission("billing.quotations.manage");
  const status = (await body(request)).status;
  if (!QUOTATION_RESPONSES.includes(status as never)) invalid({ status: "Choose accepted or declined." });
  const doc = await respondToQuotation(ctx.organizationId, ctx.user.id, id, status as (typeof QUOTATION_RESPONSES)[number]);
  return Response.json({ ...doc, actions: actionsFor(ctx, doc) });
});
