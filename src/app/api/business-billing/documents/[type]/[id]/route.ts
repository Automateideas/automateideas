import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { deleteDraft, getDocument, updateDraft } from "@/lib/business-billing/documents/service";
import { DOCUMENT_TYPES } from "@/lib/business-billing/documents/types";
import { validateDocument } from "@/lib/business-billing/documents/validation";
import { body, valuesOrThrow } from "@/lib/business-billing/route-helpers";

import { actionsFor, slugOf } from "../../_shared";

type Ctx = RouteContext<"/api/business-billing/documents/[type]/[id]">;

// GET: the document, its lines, related documents and allowed actions (billing.view).
export const GET = route(async (_request: Request, { params }: Ctx) => {
  const { type, id } = await params;
  const slug = slugOf(type);
  const ctx = await requireBillingPermission("billing.view");
  const doc = await getDocument(ctx.organizationId, slug, id);
  return Response.json({ ...doc, actions: actionsFor(ctx, doc) });
});

// PUT: replace a draft. Issued documents are locked (409 DOCUMENT_LOCKED).
export const PUT = route(async (request: Request, { params }: Ctx) => {
  const { type, id } = await params;
  const slug = slugOf(type);
  const ctx = await requireBillingPermission(DOCUMENT_TYPES[slug].permission);
  const values = valuesOrThrow(validateDocument(slug, await body(request)));
  const doc = await updateDraft(ctx.organizationId, ctx.user.id, slug, id, values);
  return Response.json({ ...doc, actions: actionsFor(ctx, doc) });
});

// DELETE: drafts only.
export const DELETE = route(async (_request: Request, { params }: Ctx) => {
  const { type, id } = await params;
  const slug = slugOf(type);
  const { organizationId } = await requireBillingPermission(DOCUMENT_TYPES[slug].permission);
  await deleteDraft(organizationId, slug, id);
  return new Response(null, { status: 204 });
});
