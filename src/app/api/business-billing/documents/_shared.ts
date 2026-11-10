import { APIError } from "better-auth/api";

import { requireBillingPermission } from "@/lib/business-billing/access";
import { DOCUMENT_TYPES, type DocumentSlug, isDocumentSlug } from "@/lib/business-billing/documents/types";
import type { DocumentDetail } from "@/lib/business-billing/documents/service";
import { hasBillingPermission } from "@/lib/roles";

/** The document type from the URL, or a 404. */
export function slugOf(type: string): DocumentSlug {
  if (!isDocumentSlug(type)) throw new APIError("NOT_FOUND", { code: "NOT_FOUND", message: "Unknown document type." });
  return type;
}

type Ctx = Awaited<ReturnType<typeof requireBillingPermission>>;

/** What the current member can do with this document right now. */
export function actionsFor(ctx: Ctx, doc: DocumentDetail) {
  const type = DOCUMENT_TYPES[doc.slug];
  const canEdit = hasBillingPermission(ctx.roles, type.permission) && ctx.entitlements.access.state !== "read_only";
  const s = doc.status;
  const convertFrom: Record<DocumentSlug, string[]> = {
    quotations: ["sent", "accepted"],
    "sales-orders": ["confirmed", "fulfilled"],
    invoices: ["issued", "partially_paid", "paid"],
    "credit-notes": [],
    "debit-notes": [],
  };
  return {
    canEdit,
    readOnlyReason: ctx.entitlements.access.state === "read_only" ? ctx.entitlements.access.reason : null,
    edit: canEdit && s === "draft",
    delete: canEdit && s === "draft",
    issue: canEdit && s === "draft",
    void: canEdit && s !== "draft" && s !== "void" && !(doc.slug === "quotations" && s === "converted") && !(doc.slug === "sales-orders" && s === "invoiced"),
    respond: canEdit && doc.slug === "quotations" && ["sent", "accepted", "declined"].includes(s),
    convertTo: canEdit && convertFrom[doc.slug].includes(s) ? type.convertsTo.filter((t) => hasBillingPermission(ctx.roles, DOCUMENT_TYPES[t].permission)) : [],
  };
}
