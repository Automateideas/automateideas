import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { getService, updateService } from "@/lib/business-billing/catalogue";
import { validateService } from "@/lib/business-billing/catalogue-validation";
import { body, editAccess, valuesOrThrow } from "@/lib/business-billing/route-helpers";

type Ctx = RouteContext<"/api/business-billing/services/[id]">;

// GET /api/business-billing/services/:id (billing.view).
export const GET = route(async (_request: Request, { params }: Ctx) => {
  const ctx = await requireBillingPermission("billing.view");
  const item = await getService(ctx.organizationId, (await params).id);
  return Response.json({ ...item, ...editAccess(ctx, "billing.catalog.manage") });
});

// PUT: replace its details (billing.catalog.manage).
export const PUT = route(async (request: Request, { params }: Ctx) => {
  const { organizationId, user } = await requireBillingPermission("billing.catalog.manage");
  const values = valuesOrThrow(validateService(await body(request)));
  return Response.json(await updateService(organizationId, user.id, (await params).id, values));
});
