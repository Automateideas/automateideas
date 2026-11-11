import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { documentEmailDefaults, sendDocumentEmail, validateSend } from "@/lib/business-billing/communication/service";
import { DOCUMENT_TYPES } from "@/lib/business-billing/documents/types";
import { body, valuesOrThrow } from "@/lib/business-billing/route-helpers";

import { slugOf } from "../../../_shared";

// GET (billing.view): what the email dialog starts with (the contact's address, a ready
// subject and message) and whether email is set up on this server.
export const GET = route(async (_request: Request, { params }: RouteContext<"/api/business-billing/documents/[type]/[id]/email">) => {
  const { type, id } = await params;
  const { organizationId } = await requireBillingPermission("billing.view");
  return Response.json(await documentEmailDefaults(organizationId, slugOf(type), id));
});

// POST { to, cc?, subject?, message?, attachPdf? } (the document type's manage permission):
// emails an issued document with its PDF attached and a link to view it. Logged on the document.
export const POST = route(async (request: Request, { params }: RouteContext<"/api/business-billing/documents/[type]/[id]/email">) => {
  const { type, id } = await params;
  const slug = slugOf(type);
  const { organizationId, user } = await requireBillingPermission(DOCUMENT_TYPES[slug].permission);
  const values = valuesOrThrow(validateSend(await body(request)));
  return Response.json(await sendDocumentEmail(organizationId, user.id, slug, id, values), { status: 201 });
});
