import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { getBranding, setShowLogo } from "@/lib/business-billing/branding";
import { invalid } from "@/lib/business-billing/records";
import { body, editAccess } from "@/lib/business-billing/route-helpers";

// GET /api/business-billing/branding (billing.view): whether documents show the workspace logo.
// The logo itself is uploaded and removed through /api/organization/logo.
export const GET = route(async () => {
  const ctx = await requireBillingPermission("billing.view");
  return Response.json({ ...(await getBranding(ctx.organizationId)), ...editAccess(ctx, "billing.settings.manage") });
});

// PUT { showLogo } (billing.settings.manage).
export const PUT = route(async (request: Request) => {
  const ctx = await requireBillingPermission("billing.settings.manage");
  const showLogo = (await body(request)).showLogo;
  if (typeof showLogo !== "boolean") invalid({ showLogo: "Send showLogo: true or false." });
  return Response.json({ ...(await setShowLogo(ctx.organizationId, ctx.user.id, showLogo as boolean)), canEdit: true, readOnlyReason: null });
});
