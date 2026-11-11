import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { updateAccount } from "@/lib/business-billing/accounting/service";
import { validateAccount } from "@/lib/business-billing/accounting/validation";
import { body, valuesOrThrow } from "@/lib/business-billing/route-helpers";

// PUT { code, name, type, parentId? } (billing.accounting.manage). Standard accounts
// keep their type; any account keeps it once entries are posted to it.
export const PUT = route(async (request: Request, { params }: RouteContext<"/api/business-billing/accounting/accounts/[id]">) => {
  const { organizationId, user } = await requireBillingPermission("billing.accounting.manage");
  const values = valuesOrThrow(validateAccount(await body(request)));
  return Response.json(await updateAccount(organizationId, user.id, (await params).id, values));
});
