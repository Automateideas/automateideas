import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { setCustomerArchived } from "@/lib/business-billing/customers";
import { archivedFlag } from "@/lib/business-billing/route-helpers";

// POST /api/business-billing/customers/:id/archive { archived } (billing.customers.manage).
// Customers are archived, never deleted.
export const POST = route(async (request: Request, { params }: RouteContext<"/api/business-billing/customers/[id]/archive">) => {
  const { organizationId, user } = await requireBillingPermission("billing.customers.manage");
  return Response.json(await setCustomerArchived(organizationId, user.id, (await params).id, await archivedFlag(request)));
});
