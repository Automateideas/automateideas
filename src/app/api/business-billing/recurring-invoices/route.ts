import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { invalid, parseListQuery } from "@/lib/business-billing/records";
import { createRecurring, listRecurring } from "@/lib/business-billing/recurring/service";
import { validateSchedule } from "@/lib/business-billing/recurring/schedule";
import { FieldReader } from "@/lib/business-billing/fields";
import { body, editAccess, valuesOrThrow } from "@/lib/business-billing/route-helpers";

const STATUSES = ["active", "paused", "ended"] as const;

// GET /api/business-billing/recurring-invoices?q=&state=active|paused|ended&customerId=&page= (billing.view).
export const GET = route(async (request: Request) => {
  const ctx = await requireBillingPermission("billing.view");
  const p = new URL(request.url).searchParams;
  const { q, page, pageSize } = parseListQuery(request.url);
  const status = STATUSES.find((s) => s === p.get("state")) ?? null;
  const list = await listRecurring(ctx.organizationId, { q, status, page, pageSize, customerId: p.get("customerId") || null });
  return Response.json({ ...list, ...editAccess(ctx, "billing.invoices.manage") });
});

// POST { invoiceId, name, frequency, interval, startDate, endDate?, maxCount?, dueDays?, autoIssue, autoEmail }
// (billing.invoices.manage): make an invoice recurring. Its customer and items become the template.
export const POST = route(async (request: Request) => {
  const { organizationId, user } = await requireBillingPermission("billing.invoices.manage");
  const raw = await body(request);
  const r = new FieldReader(raw);
  const invoiceId = r.id("invoiceId", "Choose the invoice to copy.");
  if (!r.ok) invalid(r.errors);
  const values = valuesOrThrow(validateSchedule(raw));
  return Response.json(await createRecurring(organizationId, user.id, invoiceId!, values), { status: 201 });
});
