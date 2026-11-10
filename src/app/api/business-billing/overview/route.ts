import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { getBillingSettings } from "@/lib/business-billing/settings";
import { BUSINESS_BILLING_PERMISSIONS, hasBillingPermission } from "@/lib/roles";

// GET /api/business-billing/overview: the /billing home (billing.view).
// Business Billing only; SaaS subscription data lives under /api/subscription.
export const GET = route(async () => {
  const { organizationId, roles } = await requireBillingPermission("billing.view");
  const settings = await getBillingSettings(organizationId);

  return Response.json({
    company: {
      configured: settings.configured,
      name: settings.tradeName ?? settings.legalName,
      gstin: settings.gstin,
      currency: settings.currency,
    },
    permissions: BUSINESS_BILLING_PERMISSIONS.filter((p) => hasBillingPermission(roles, p)),
  });
});
