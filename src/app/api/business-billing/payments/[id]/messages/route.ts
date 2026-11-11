import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { listMessages } from "@/lib/business-billing/communication/service";

// GET (billing.view): receipts emailed for this payment, newest first.
export const GET = route(async (_request: Request, { params }: RouteContext<"/api/business-billing/payments/[id]/messages">) => {
  const { organizationId } = await requireBillingPermission("billing.view");
  return Response.json({ items: await listMessages(organizationId, "receipt", (await params).id) });
});
