import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { sendDocumentWhatsApp } from "@/lib/business-billing/communication/service";
import { DOCUMENT_TYPES } from "@/lib/business-billing/documents/types";
import { body } from "@/lib/business-billing/route-helpers";

import { slugOf } from "../../../_shared";

// POST { to? } (the document type's manage permission): send an issued document on WhatsApp
// through the Cloud API, from the company's own number or the shared Automate Ideas number.
// `to` defaults to the contact's mobile number. Logged on the document.
export const POST = route(async (request: Request, { params }: RouteContext<"/api/business-billing/documents/[type]/[id]/whatsapp">) => {
  const { type, id } = await params;
  const slug = slugOf(type);
  const { organizationId, user } = await requireBillingPermission(DOCUMENT_TYPES[slug].permission);
  const raw = await body(request).catch(() => ({}) as Record<string, unknown>);
  const to = typeof raw.to === "string" && raw.to.trim() ? raw.to : null;
  return Response.json(await sendDocumentWhatsApp(organizationId, user.id, slug, id, to), { status: 201 });
});
