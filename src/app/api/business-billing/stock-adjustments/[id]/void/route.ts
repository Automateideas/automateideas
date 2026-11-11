import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { FieldReader } from "@/lib/business-billing/fields";
import { voidAdjustment } from "@/lib/business-billing/inventory/service";
import { invalid } from "@/lib/business-billing/records";
import { body } from "@/lib/business-billing/route-helpers";

// POST { reason } (billing.inventory.manage): void an adjustment or transfer; its stock
// changes are reversed (dated today) and the record stays.
export const POST = route(async (request: Request, { params }: RouteContext<"/api/business-billing/stock-adjustments/[id]/void">) => {
  const { organizationId, user } = await requireBillingPermission("billing.inventory.manage");
  const r = new FieldReader(await body(request));
  const reason = r.text("reason", 300, "Say why it's being voided.");
  if (!r.ok) invalid(r.errors);
  return Response.json(await voidAdjustment(organizationId, user.id, (await params).id, reason!));
});
