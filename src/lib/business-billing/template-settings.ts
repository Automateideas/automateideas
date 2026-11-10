import { eq } from "drizzle-orm";

import { db } from "@/db";
import { billingSettings, organization } from "@/db/schema";
import { getFileBytes } from "@/lib/storage";

import { invalid } from "./records";
import { type DocumentTemplate, templateFrom } from "./template";
import { withTenant } from "./tenant-db";

// Document template settings (on billing_settings) and the images documents
// carry: the workspace logo (organization.logo), signature and stamp.

export type ImageKind = "signature" | "stamp";
const COLUMN = { signature: "signatureKey", stamp: "stampKey" } as const;

async function readRow(organizationId: string) {
  return withTenant(organizationId, async (tx) => {
    const [s] = await tx
      .select({ template: billingSettings.documentTemplate, signatureKey: billingSettings.signatureKey, stampKey: billingSettings.stampKey, showLogo: billingSettings.showLogo })
      .from(billingSettings)
      .where(eq(billingSettings.organizationId, organizationId));
    return s ?? null;
  });
}

export async function getTemplateSettings(organizationId: string) {
  const s = await readRow(organizationId);
  return {
    configured: !!s,
    template: templateFrom(s?.template),
    hasSignature: !!s?.signatureKey,
    hasStamp: !!s?.stampKey,
    signatureUrl: s?.signatureKey ? "/api/business-billing/template/images/signature" : null,
    stampUrl: s?.stampKey ? "/api/business-billing/template/images/stamp" : null,
  };
}

export async function saveTemplate(organizationId: string, userId: string, template: DocumentTemplate) {
  await withTenant(organizationId, async (tx) => {
    const updated = await tx
      .update(billingSettings)
      .set({ documentTemplate: template, updatedBy: userId })
      .where(eq(billingSettings.organizationId, organizationId))
      .returning({ id: billingSettings.organizationId });
    if (!updated.length) invalid({ form: "Save your company details first (Billing → Settings)." }, "Save your company details first.");
  });
  return getTemplateSettings(organizationId);
}

export async function imageKey(organizationId: string, kind: ImageKind) {
  const s = await readRow(organizationId);
  return s ? s[COLUMN[kind]] : null;
}

/** Stores a new image key (or null) and returns the previous one, for cleanup. */
export async function setImageKey(organizationId: string, userId: string, kind: ImageKind, key: string | null) {
  return withTenant(organizationId, async (tx) => {
    const [s] = await tx.select({ key: billingSettings[COLUMN[kind]] }).from(billingSettings).where(eq(billingSettings.organizationId, organizationId));
    if (!s) invalid({ form: "Save your company details first (Billing → Settings)." }, "Save your company details first.");
    await tx
      .update(billingSettings)
      .set({ [COLUMN[kind]]: key, updatedBy: userId })
      .where(eq(billingSettings.organizationId, organizationId));
    return s.key;
  });
}

/** PNG/JPEG only: the PDF engine can't embed SVG or WebP. */
const PDF_IMAGE = /^image\/(png|jpe?g)$/;

async function bytesOrNull(key: string | null) {
  if (!key) return null;
  try {
    const f = await getFileBytes(key);
    const type = f.contentType ?? (key.endsWith(".png") ? "image/png" : key.match(/\.jpe?g$/) ? "image/jpeg" : "");
    if (!PDF_IMAGE.test(type)) return null;
    return `data:${type};base64,${Buffer.from(f.bytes).toString("base64")}`;
  } catch (error) {
    // A missing image shouldn't stop the PDF.
    console.error("PDF image unavailable", { key, error });
    return null;
  }
}

/** Everything a PDF needs besides the document: template and images as data URLs. */
export async function documentAssets(organizationId: string) {
  const s = await readRow(organizationId);
  const [org] = await db.select({ logo: organization.logo }).from(organization).where(eq(organization.id, organizationId));
  const template = templateFrom(s?.template);
  const [logo, signature, stamp] = await Promise.all([
    s?.showLogo ? bytesOrNull(org?.logo ?? null) : Promise.resolve(null),
    template.showSignature ? bytesOrNull(s?.signatureKey ?? null) : Promise.resolve(null),
    template.showStamp ? bytesOrNull(s?.stampKey ?? null) : Promise.resolve(null),
  ]);
  return { template, logo, signature, stamp };
}

export type DocumentAssets = Awaited<ReturnType<typeof documentAssets>>;
