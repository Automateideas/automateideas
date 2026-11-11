import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { setAccountArchived } from "@/lib/business-billing/accounting/service";
import { archivedFlag } from "@/lib/business-billing/route-helpers";

// POST { archived } (billing.accounting.manage). Standard accounts can't be archived,
// nor accounts with a balance.
export const POST = route(async (request: Request, { params }: RouteContext<"/api/business-billing/accounting/accounts/[id]/archive">) => {
  const { organizationId, user } = await requireBillingPermission("billing.accounting.manage");
  return Response.json(await setAccountArchived(organizationId, user.id, (await params).id, await archivedFlag(request)));
});
