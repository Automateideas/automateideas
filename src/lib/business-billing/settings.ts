import { eq } from "drizzle-orm";

import { billingSettings, organization } from "@/db/schema";

import { DEFAULT_BILLING_SETTINGS, type BillingSettingsValues } from "./settings-validation";
import { type TenantTx, withTenant } from "./tenant-db";

// Queries still filter by organization_id; row-level security (withTenant) is
// the second lock, so a missing filter can't leak another tenant's settings.

async function readSettings(tx: TenantTx, organizationId: string) {
  const [row] = await tx
    .select()
    .from(billingSettings)
    .where(eq(billingSettings.organizationId, organizationId))
    .limit(1);

  if (row) {
    const values: BillingSettingsValues = {
      legalName: row.legalName,
      tradeName: row.tradeName,
      gstin: row.gstin,
      pan: row.pan,
      email: row.email,
      phone: row.phone,
      addressLine1: row.addressLine1,
      addressLine2: row.addressLine2,
      city: row.city,
      state: row.state,
      postalCode: row.postalCode,
      countryCode: row.countryCode,
      currency: row.currency as BillingSettingsValues["currency"],
      financialYearStartMonth: row.financialYearStartMonth,
      invoicePrefix: row.invoicePrefix,
    };
    return { configured: true as const, ...values, updatedAt: row.updatedAt };
  }

  const [org] = await tx
    .select({ name: organization.name })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1);
  return {
    configured: false as const,
    legalName: org?.name ?? "",
    ...DEFAULT_BILLING_SETTINGS,
    updatedAt: null,
  };
}

/**
 * The tenant's company billing settings. Before the first save it returns the
 * defaults with the organization's name, and `configured: false`.
 */
export async function getBillingSettings(organizationId: string) {
  return withTenant(organizationId, (tx) => readSettings(tx, organizationId));
}

/** Creates or replaces the tenant's settings. `values` must already be validated. */
export async function saveBillingSettings(organizationId: string, userId: string, values: BillingSettingsValues) {
  return withTenant(organizationId, async (tx) => {
    await tx
      .insert(billingSettings)
      .values({ organizationId, updatedBy: userId, ...values })
      .onConflictDoUpdate({
        target: billingSettings.organizationId,
        set: { ...values, updatedBy: userId, updatedAt: new Date() },
      });
    return readSettings(tx, organizationId);
  });
}
