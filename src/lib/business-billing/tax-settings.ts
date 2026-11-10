import { eq } from "drizzle-orm";

import { billingSettings } from "@/db/schema";

import { type NumberingSettings, numberingFrom } from "./numbering-format";
import { invalid } from "./records";
import type { RoundOffMode, TaxSettingsValues } from "./tax-settings-validation";
import { type TenantTx, withTenant } from "./tenant-db";

// Tax and numbering settings live on the tenant's billing_settings row
// (created by saving company details). Queries filter by organization_id and
// run under row-level security (withTenant).

async function readRow(tx: TenantTx, organizationId: string) {
  const [s] = await tx.select().from(billingSettings).where(eq(billingSettings.organizationId, organizationId));
  return s ?? null;
}

/** The seller's side of every tax calculation. */
export type SellerTaxProfile = {
  configured: boolean;
  gstin: string | null;
  registered: boolean;
  stateCode: string | null;
  pricesIncludeTax: boolean;
  roundOff: RoundOffMode;
};

export async function sellerTaxProfile(tx: TenantTx, organizationId: string): Promise<SellerTaxProfile> {
  const s = await readRow(tx, organizationId);
  return {
    configured: !!s,
    gstin: s?.gstin ?? null,
    registered: !!s?.gstin,
    // The GSTIN decides the state when there is one.
    stateCode: s?.gstin ? s.gstin.slice(0, 2) : (s?.stateCode ?? null),
    pricesIncludeTax: s?.pricesIncludeTax ?? false,
    roundOff: (s?.roundOff as RoundOffMode) ?? "nearest_rupee",
  };
}

export async function getTaxSettings(organizationId: string) {
  return withTenant(organizationId, async (tx) => {
    const s = await readRow(tx, organizationId);
    return {
      ...(await sellerTaxProfile(tx, organizationId)),
      financialYearStartMonth: s?.financialYearStartMonth ?? 4,
      numbering: numberingFrom(s?.documentNumbering, s?.invoicePrefix),
      updatedAt: s?.updatedAt ?? null,
    };
  });
}

function requireConfigured(s: unknown): asserts s {
  if (!s) invalid({ form: "Save your company details first (Billing → Settings)." }, "Save your company details first.");
}

/** `values` must be validated against the saved GSTIN (validateTaxSettings). */
export async function saveTaxSettings(organizationId: string, userId: string, values: TaxSettingsValues) {
  return withTenant(organizationId, async (tx) => {
    requireConfigured(await readRow(tx, organizationId));
    await tx
      .update(billingSettings)
      .set({ ...values, updatedBy: userId })
      .where(eq(billingSettings.organizationId, organizationId));
  }).then(() => getTaxSettings(organizationId));
}

export async function saveNumbering(organizationId: string, userId: string, numbering: NumberingSettings) {
  return withTenant(organizationId, async (tx) => {
    requireConfigured(await readRow(tx, organizationId));
    await tx
      .update(billingSettings)
      .set({ documentNumbering: numbering, updatedBy: userId })
      .where(eq(billingSettings.organizationId, organizationId));
  }).then(() => getTaxSettings(organizationId));
}

/** The saved GSTIN, for validating tax settings. */
export async function companyGstin(organizationId: string) {
  return withTenant(organizationId, async (tx) => (await readRow(tx, organizationId))?.gstin ?? null);
}
