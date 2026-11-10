import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { validateCustomer } from "@/lib/business-billing/contacts-validation";
import { createCustomer, listCustomers } from "@/lib/business-billing/customers";
import { parseListQuery } from "@/lib/business-billing/records";
import { body, editAccess, valuesOrThrow } from "@/lib/business-billing/route-helpers";

// GET /api/business-billing/customers?q=&status=active|archived|all&page=: list (billing.view).
export const GET = route(async (request: Request) => {
  const ctx = await requireBillingPermission("billing.view");
  const list = await listCustomers(ctx.organizationId, parseListQuery(request.url));
  return Response.json({ ...list, ...editAccess(ctx, "billing.customers.manage") });
});

// POST: create (billing.customers.manage). 409 POSSIBLE_DUPLICATE (details.matches)
// unless the body has allowDuplicate: true; 409 DUPLICATE_GSTIN always.
export const POST = route(async (request: Request) => {
  const { organizationId, user } = await requireBillingPermission("billing.customers.manage");
  const raw = await body(request);
  const values = valuesOrThrow(validateCustomer(raw));
  const customer = await createCustomer(organizationId, user.id, values, raw.allowDuplicate === true);
  return Response.json(customer, { status: 201 });
});
