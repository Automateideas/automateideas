import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { listMessages } from "@/lib/business-billing/communication/service";

import { slugOf } from "../../../_shared";

// GET (billing.view): emails, reminders and WhatsApp shares sent for this document, newest first.
export const GET = route(async (_request: Request, { params }: RouteContext<"/api/business-billing/documents/[type]/[id]/messages">) => {
  const { type, id } = await params;
  const { organizationId } = await requireBillingPermission("billing.view");
  return Response.json({ items: await listMessages(organizationId, slugOf(type), id) });
});
