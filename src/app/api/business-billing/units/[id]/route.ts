import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { updateUnit } from "@/lib/business-billing/catalogue";
import { validateUnit } from "@/lib/business-billing/catalogue-validation";
import { body, valuesOrThrow } from "@/lib/business-billing/route-helpers";

// PUT /api/business-billing/units/:id (billing.catalog.manage).
export const PUT = route(async (request: Request, { params }: RouteContext<"/api/business-billing/units/[id]">) => {
  const { organizationId, user } = await requireBillingPermission("billing.catalog.manage");
  const values = valuesOrThrow(validateUnit(await body(request)));
  return Response.json(await updateUnit(organizationId, user.id, (await params).id, values));
});
