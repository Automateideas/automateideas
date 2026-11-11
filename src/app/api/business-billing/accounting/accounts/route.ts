import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { createAccount, listAccounts } from "@/lib/business-billing/accounting/service";
import { validateAccount } from "@/lib/business-billing/accounting/validation";
import { body, editAccess, valuesOrThrow } from "@/lib/business-billing/route-helpers";

// GET /api/business-billing/accounting/accounts (billing.reports.view): the chart of
// accounts with balances to date. The standard accounts are created on first use.
export const GET = route(async () => {
  const ctx = await requireBillingPermission("billing.reports.view");
  return Response.json({ ...(await listAccounts(ctx.organizationId)), ...editAccess(ctx, "billing.accounting.manage") });
});

// POST { code, name, type, parentId? } (billing.accounting.manage): add an account.
export const POST = route(async (request: Request) => {
  const { organizationId, user } = await requireBillingPermission("billing.accounting.manage");
  const values = valuesOrThrow(validateAccount(await body(request)));
  return Response.json(await createAccount(organizationId, user.id, values), { status: 201 });
});
