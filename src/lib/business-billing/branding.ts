import { eq } from "drizzle-orm";

import { db } from "@/db";
import { billingSettings, organization } from "@/db/schema";
import { storageEnabled } from "@/lib/storage";

import { invalid } from "./records";
import { withTenant } from "./tenant-db";

// Document branding. The logo itself is the workspace logo (organization.logo,
// uploaded at sign-up or through /api/organization/logo, stored by
// lib/storage.ts); Business Billing only decides whether documents show it.

export async function getBranding(organizationId: string) {
  // organization isn't a tenant table; read it directly, by id.
  const [org] = await db.select({ logo: organization.logo }).from(organization).where(eq(organization.id, organizationId));
  const showLogo = await withTenant(organizationId, async (tx) => {
    const [s] = await tx.select({ showLogo: billingSettings.showLogo }).from(billingSettings).where(eq(billingSettings.organizationId, organizationId));
    return s ? s.showLogo : null;
  });
  const hasLogo = !!org?.logo;
  return {
    configured: showLogo !== null,
    hasLogo,
    showLogo: showLogo ?? false,
    /** What documents actually do: the switch is on and there is a logo. */
    logoOnDocuments: !!showLogo && hasLogo,
    logoUrl: hasLogo ? "/api/organization/logo" : null,
    uploadsEnabled: storageEnabled(),
  };
}

export async function setShowLogo(organizationId: string, userId: string, showLogo: boolean) {
  await withTenant(organizationId, async (tx) => {
    const updated = await tx
      .update(billingSettings)
      .set({ showLogo, updatedBy: userId })
      .where(eq(billingSettings.organizationId, organizationId))
      .returning({ id: billingSettings.organizationId });
    if (!updated.length) invalid({ form: "Save your company details first (Billing → Settings)." }, "Save your company details first.");
  });
  return getBranding(organizationId);
}
