import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { sendReceiptWhatsApp } from "@/lib/business-billing/communication/service";
import { body } from "@/lib/business-billing/route-helpers";

// POST { to? } (billing.payments.manage): send the receipt on WhatsApp through the Cloud API.
export const POST = route(async (request: Request, { params }: RouteContext<"/api/business-billing/payments/[id]/whatsapp">) => {
  const { organizationId, user } = await requireBillingPermission("billing.payments.manage");
  const raw = await body(request).catch(() => ({}) as Record<string, unknown>);
  const to = typeof raw.to === "string" && raw.to.trim() ? raw.to : null;
  return Response.json(await sendReceiptWhatsApp(organizationId, user.id, (await params).id, to), { status: 201 });
});
