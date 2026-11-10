import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { createDraft, listDocuments } from "@/lib/business-billing/documents/service";
import { DOCUMENT_TYPES } from "@/lib/business-billing/documents/types";
import { validateDocument } from "@/lib/business-billing/documents/validation";
import { parseListQuery } from "@/lib/business-billing/records";
import { body, editAccess, valuesOrThrow } from "@/lib/business-billing/route-helpers";

import { slugOf } from "../_shared";

type Ctx = RouteContext<"/api/business-billing/documents/[type]">;

// GET /api/business-billing/documents/:type?q=&status=&customerId=&page= (billing.view).
// :type is invoices, quotations, sales-orders, credit-notes or debit-notes.
// status also accepts "open", "overdue" (invoices) and "expired" (quotations).
export const GET = route(async (request: Request, { params }: Ctx) => {
  const slug = slugOf((await params).type);
  const ctx = await requireBillingPermission("billing.view");
  const sp = new URL(request.url).searchParams;
  const list = await listDocuments(ctx.organizationId, slug, {
    ...parseListQuery(request.url),
    status: sp.get("status"),
    customerId: sp.get("customerId"),
  });
  return Response.json({ ...list, ...editAccess(ctx, DOCUMENT_TYPES[slug].permission) });
});

// POST: create a draft. Totals are calculated here; any sent by the browser are ignored.
export const POST = route(async (request: Request, { params }: Ctx) => {
  const slug = slugOf((await params).type);
  const { organizationId, user } = await requireBillingPermission(DOCUMENT_TYPES[slug].permission);
  const values = valuesOrThrow(validateDocument(slug, await body(request)));
  return Response.json(await createDraft(organizationId, user.id, slug, values), { status: 201 });
});
