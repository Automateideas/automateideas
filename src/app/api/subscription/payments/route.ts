import { SUBSCRIPTION_ROLES, requireOrgRole, route } from "@/lib/access";
import { listPayments } from "@/lib/subscription-billing/payments";

// GET /api/subscription/payments: PayU seat payments for the org, newest first
// (owner/admin only). Feeds /subscription/payments, /history and /invoices.
export const GET = route(async () => {
  const { organizationId } = await requireOrgRole(SUBSCRIPTION_ROLES);
  const payments = await listPayments(organizationId);
  return Response.json({ payments });
});
