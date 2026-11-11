import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { accountingSettings, setBooksLock } from "@/lib/business-billing/accounting/service";
import { validateBooksLock } from "@/lib/business-billing/accounting/validation";
import { todayInIndia } from "@/lib/business-billing/documents/types";
import { body, editAccess, valuesOrThrow } from "@/lib/business-billing/route-helpers";

// GET /api/business-billing/accounting/settings (billing.reports.view): the books lock
// date and the current financial year.
export const GET = route(async () => {
  const ctx = await requireBillingPermission("billing.reports.view");
  return Response.json({ ...(await accountingSettings(ctx.organizationId)), ...editAccess(ctx, "billing.accounting.manage") });
});

// PUT { booksLockedUntil: "YYYY-MM-DD" | null } (billing.accounting.manage): close the
// books up to a date (nothing can be issued, paid or posted on or before it), or reopen them.
export const PUT = route(async (request: Request) => {
  const ctx = await requireBillingPermission("billing.accounting.manage");
  const { booksLockedUntil } = valuesOrThrow(validateBooksLock(await body(request), todayInIndia()));
  return Response.json({ ...(await setBooksLock(ctx.organizationId, ctx.user.id, booksLockedUntil)), ...editAccess(ctx, "billing.accounting.manage") });
});
