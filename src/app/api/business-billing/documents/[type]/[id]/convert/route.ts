import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { convertDocument } from "@/lib/business-billing/documents/service";
import { DOCUMENT_TYPES, isDocumentSlug } from "@/lib/business-billing/documents/types";
import { invalid } from "@/lib/business-billing/records";
import { body } from "@/lib/business-billing/route-helpers";

import { slugOf } from "../../../_shared";

// POST { to }: make a new draft from this document (quotation → sales order or
// invoice, sales order → invoice, invoice → credit or debit note). Needs the
// permission of the document being created.
export const POST = route(async (request: Request, { params }: RouteContext<"/api/business-billing/documents/[type]/[id]/convert">) => {
  const { type, id } = await params;
  const from = slugOf(type);
  const to = (await body(request)).to;
  if (typeof to !== "string" || !isDocumentSlug(to)) invalid({ to: "Choose what to create." });
  const ctx = await requireBillingPermission(DOCUMENT_TYPES[to as keyof typeof DOCUMENT_TYPES].permission);
  const draft = await convertDocument(ctx.organizationId, ctx.user.id, from, id, to as keyof typeof DOCUMENT_TYPES);
  return Response.json(draft, { status: 201 });
});
