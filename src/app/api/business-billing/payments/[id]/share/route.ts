import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { shareReceipt } from "@/lib/business-billing/communication/service";
import { revokeShares } from "@/lib/business-billing/communication/shares";
import { body } from "@/lib/business-billing/route-helpers";

// POST { channel: "link" | "whatsapp" } (billing.payments.manage): a secret link to the receipt
// PDF plus a ready WhatsApp message.
export const POST = route(async (request: Request, { params }: RouteContext<"/api/business-billing/payments/[id]/share">) => {
  const { organizationId, user } = await requireBillingPermission("billing.payments.manage");
  const raw = await body(request).catch(() => ({}) as Record<string, unknown>);
  return Response.json(await shareReceipt(organizationId, user.id, (await params).id, raw.channel === "whatsapp" ? "whatsapp" : "link"), { status: 201 });
});

// DELETE (billing.payments.manage): turn off every link to this receipt.
export const DELETE = route(async (_request: Request, { params }: RouteContext<"/api/business-billing/payments/[id]/share">) => {
  const { organizationId, user } = await requireBillingPermission("billing.payments.manage");
  return Response.json(await revokeShares(organizationId, "receipt", (await params).id, user.id));
});
