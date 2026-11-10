import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { updateCategory } from "@/lib/business-billing/catalogue";
import { validateCategory } from "@/lib/business-billing/catalogue-validation";
import { body, valuesOrThrow } from "@/lib/business-billing/route-helpers";

// PUT /api/business-billing/categories/:id (billing.catalog.manage).
export const PUT = route(async (request: Request, { params }: RouteContext<"/api/business-billing/categories/[id]">) => {
  const { organizationId, user } = await requireBillingPermission("billing.catalog.manage");
  const values = valuesOrThrow(validateCategory(await body(request)));
  return Response.json(await updateCategory(organizationId, user.id, (await params).id, values));
});
