import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { issueDocument } from "@/lib/business-billing/documents/service";
import { DOCUMENT_TYPES } from "@/lib/business-billing/documents/types";
import { assertInvoiceQuota } from "@/lib/subscription-billing/entitlements";

import { actionsFor, slugOf } from "../../../_shared";

// POST: issue a draft (numbers it, copies seller and customer details, locks it).
// Invoices count towards the plan's monthly invoice limit.
export const POST = route(async (_request: Request, { params }: RouteContext<"/api/business-billing/documents/[type]/[id]/issue">) => {
  const { type, id } = await params;
  const slug = slugOf(type);
  const ctx = await requireBillingPermission(DOCUMENT_TYPES[slug].permission);
  const beforeIssue = slug === "invoices" ? () => assertInvoiceQuota(ctx.organizationId, ctx.entitlements) : undefined;
  const doc = await issueDocument(ctx.organizationId, ctx.user.id, slug, id, beforeIssue);
  return Response.json({ ...doc, actions: actionsFor(ctx, doc) });
});
