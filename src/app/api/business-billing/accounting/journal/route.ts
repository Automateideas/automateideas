import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { createManualEntry, listJournal } from "@/lib/business-billing/accounting/service";
import { isIsoDate, validateJournal } from "@/lib/business-billing/accounting/validation";
import { readIdempotencyKey } from "@/lib/business-billing/payments/validation";
import { parseListQuery } from "@/lib/business-billing/records";
import { body, editAccess, valuesOrThrow } from "@/lib/business-billing/route-helpers";

// GET /api/business-billing/accounting/journal?q=&from=&to=&source=all|manual|automatic&page=
// (billing.reports.view): every journal entry, newest first.
export const GET = route(async (request: Request) => {
  const ctx = await requireBillingPermission("billing.reports.view");
  const p = new URL(request.url).searchParams;
  const { q, page, pageSize } = parseListQuery(request.url);
  const source = (["manual", "automatic"] as const).find((s) => s === p.get("source")) ?? "all";
  const from = p.get("from");
  const to = p.get("to");
  const list = await listJournal(ctx.organizationId, { q, page, pageSize, source, from: isIsoDate(from) ? from : null, to: isIsoDate(to) ? to : null });
  return Response.json({ ...list, ...editAccess(ctx, "billing.accounting.manage") });
});

// POST (billing.accounting.manage): a manual entry
// { date, narration, lines: [{ accountId, debit, credit, customerId?, supplierId?, description? }] }.
// Debits must equal credits. Idempotency-Key header: a repeat returns the entry already posted (200).
export const POST = route(async (request: Request) => {
  const { organizationId, user } = await requireBillingPermission("billing.accounting.manage");
  const values = valuesOrThrow(validateJournal(await body(request)));
  const entry = await createManualEntry(organizationId, user.id, values, readIdempotencyKey(request.headers.get("idempotency-key")));
  return Response.json(entry, { status: entry.replayed ? 200 : 201 });
});
