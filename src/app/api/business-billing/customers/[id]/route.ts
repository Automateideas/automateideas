import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { validateCustomer } from "@/lib/business-billing/contacts-validation";
import { getCustomer, updateCustomer } from "@/lib/business-billing/customers";
import { body, editAccess, valuesOrThrow } from "@/lib/business-billing/route-helpers";

type Ctx = RouteContext<"/api/business-billing/customers/[id]">;

// GET /api/business-billing/customers/:id (billing.view).
export const GET = route(async (_request: Request, { params }: Ctx) => {
  const ctx = await requireBillingPermission("billing.view");
  const customer = await getCustomer(ctx.organizationId, (await params).id);
  return Response.json({ ...customer, ...editAccess(ctx, "billing.customers.manage") });
});

// PUT: replace the customer's details (billing.customers.manage).
export const PUT = route(async (request: Request, { params }: Ctx) => {
  const { organizationId, user } = await requireBillingPermission("billing.customers.manage");
  const raw = await body(request);
  const values = valuesOrThrow(validateCustomer(raw));
  return Response.json(await updateCustomer(organizationId, user.id, (await params).id, values, raw.allowDuplicate === true));
});
