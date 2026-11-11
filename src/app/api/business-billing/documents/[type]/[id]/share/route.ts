import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { shareDocument } from "@/lib/business-billing/communication/service";
import { revokeShares } from "@/lib/business-billing/communication/shares";
import { DOCUMENT_TYPES } from "@/lib/business-billing/documents/types";
import { body } from "@/lib/business-billing/route-helpers";

import { slugOf } from "../../../_shared";

// POST { channel: "link" | "whatsapp" } (the document type's manage permission): a new secret
// link to the document's PDF for someone without a login, plus a ready WhatsApp message
// (wa.me link). "whatsapp" also notes on the document that it was shared there.
export const POST = route(async (request: Request, { params }: RouteContext<"/api/business-billing/documents/[type]/[id]/share">) => {
  const { type, id } = await params;
  const slug = slugOf(type);
  const { organizationId, user } = await requireBillingPermission(DOCUMENT_TYPES[slug].permission);
  const raw = await body(request).catch(() => ({}) as Record<string, unknown>);
  const channel = raw.channel === "whatsapp" ? "whatsapp" : "link";
  return Response.json(await shareDocument(organizationId, user.id, slug, id, channel), { status: 201 });
});

// DELETE (manage permission): turn off every link to this document (e.g. sent to the wrong person).
export const DELETE = route(async (_request: Request, { params }: RouteContext<"/api/business-billing/documents/[type]/[id]/share">) => {
  const { type, id } = await params;
  const slug = slugOf(type);
  const { organizationId, user } = await requireBillingPermission(DOCUMENT_TYPES[slug].permission);
  return Response.json(await revokeShares(organizationId, slug, id, user.id));
});
