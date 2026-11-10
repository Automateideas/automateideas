import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { createService, listServices } from "@/lib/business-billing/catalogue";
import { validateService } from "@/lib/business-billing/catalogue-validation";
import { parseListQuery } from "@/lib/business-billing/records";
import { body, editAccess, valuesOrThrow } from "@/lib/business-billing/route-helpers";

// GET /api/business-billing/services?q=&status=&categoryId=&page=: list (billing.view).
export const GET = route(async (request: Request) => {
  const ctx = await requireBillingPermission("billing.view");
  const categoryId = new URL(request.url).searchParams.get("categoryId");
  const list = await listServices(ctx.organizationId, { ...parseListQuery(request.url), categoryId });
  return Response.json({ ...list, ...editAccess(ctx, "billing.catalog.manage") });
});

// POST: create (billing.catalog.manage).
export const POST = route(async (request: Request) => {
  const { organizationId, user } = await requireBillingPermission("billing.catalog.manage");
  const values = valuesOrThrow(validateService(await body(request)));
  return Response.json(await createService(organizationId, user.id, values), { status: 201 });
});
