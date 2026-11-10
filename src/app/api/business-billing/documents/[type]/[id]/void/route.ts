import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { voidDocument } from "@/lib/business-billing/documents/service";
import { DOCUMENT_TYPES } from "@/lib/business-billing/documents/types";
import { FieldReader } from "@/lib/business-billing/fields";
import { invalid } from "@/lib/business-billing/records";
import { body } from "@/lib/business-billing/route-helpers";

import { actionsFor, slugOf } from "../../../_shared";

// POST { reason }: void an issued document. It keeps its number; nothing is deleted.
export const POST = route(async (request: Request, { params }: RouteContext<"/api/business-billing/documents/[type]/[id]/void">) => {
  const { type, id } = await params;
  const slug = slugOf(type);
  const ctx = await requireBillingPermission(DOCUMENT_TYPES[slug].permission);
  const r = new FieldReader(await body(request));
  const reason = r.text("reason", 300, "Say why it's being voided.");
  if (!r.ok) invalid(r.errors);
  const doc = await voidDocument(ctx.organizationId, ctx.user.id, slug, id, reason!);
  return Response.json({ ...doc, actions: actionsFor(ctx, doc) });
});
