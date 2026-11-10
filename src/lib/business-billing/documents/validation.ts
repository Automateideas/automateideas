// Document input rules, shared by the editor and the API. Pure.
// Numbers (quantities, rates, discounts, charges) are read by the tax request
// parser, so every amount is checked the same way the GST engine expects.

import { type FieldErrors, FieldReader, stateByCode } from "../fields";
import type { ChargeInput, Discount, TaxCategory } from "../tax/gst";
import { OUTSIDE_INDIA } from "../tax/gst";
import { parseTaxRequest } from "../tax/request";
import { DOCUMENT_TYPES, type DocumentSlug } from "./types";

export type DocumentLineValues = {
  productId: string | null;
  serviceId: string | null;
  description: string;
  hsnSac: string | null;
  quantity: string;
  unitCode: string | null;
  ratePaise: number;
  discount: Discount | null;
  taxCategory: TaxCategory;
  taxRate: string;
  cessRate: string;
};

export type DocumentValues = {
  customerId: string;
  issueDate: string;
  /** dueDate / validUntil / expectedDate, depending on the type. */
  extraDate: string | null;
  invoiceId: string | null;
  reason: string | null;
  placeOfSupply: string | null;
  pricesIncludeTax: boolean;
  reverseCharge: boolean;
  zeroRated: "lut" | "with_payment" | null;
  invoiceDiscount: Discount | null;
  charges: ChargeInput[];
  notes: string | null;
  terms: string | null;
  lines: DocumentLineValues[];
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (s: string) => DATE_RE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);

function readDate(r: FieldReader, key: string, required?: string): string | null {
  const v = r.text(key, 10, required);
  if (v && !isDate(v)) {
    r.fail(key, "Enter a date as YYYY-MM-DD.");
    return null;
  }
  return v;
}

const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export function validateDocument(slug: DocumentSlug, raw: Record<string, unknown>):
  | { ok: true; values: DocumentValues }
  | { ok: false; errors: FieldErrors } {
  const type = DOCUMENT_TYPES[slug];
  const r = new FieldReader(raw);
  const errors = r.errors;

  const customerId = r.id("customerId", "Choose a customer.");
  const issueDate = readDate(r, "issueDate", "Enter the date.");
  const extraDate = type.extraDate ? readDate(r, "extraDate") : null;
  if (issueDate && extraDate && extraDate < issueDate) r.fail("extraDate", `${type.extraDate!.label} can't be before the document date.`);
  const invoiceId = type.needsInvoice ? r.id("invoiceId", "Choose the invoice this note adjusts.") : null;
  const reason = type.needsInvoice ? r.text("reason", 200, "Give a reason, e.g. Goods returned.") : null;

  const pos = r.text("placeOfSupply", 2);
  if (pos && pos !== OUTSIDE_INDIA && !stateByCode(pos)) r.fail("placeOfSupply", "Choose the place of supply.");
  const notes = r.text("notes", 2000);
  const terms = r.text("terms", 4000);

  // Amounts, flags, discounts and charges: the tax parser's rules. The place of
  // supply is checked above (and again when issuing), so it's not required here.
  const tax = parseTaxRequest(
    { ...raw, placeOfSupply: pos },
    { sellerStateCode: null, sellerRegistered: false, roundOff: "none", defaultPricesIncludeTax: false },
  );
  if (!tax.ok) for (const [k, v] of Object.entries(tax.errors)) errors[k] ??= v;

  const rawLines = Array.isArray(raw.lines) ? raw.lines : [];
  const lines: DocumentLineValues[] = rawLines.slice(0, 500).map((item, i) => {
    const lr = new FieldReader(obj(item));
    const productId = lr.id("productId");
    const serviceId = lr.id("serviceId");
    if (productId && serviceId) lr.fail("productId", "A line is either a product or a service.");
    const description = lr.text("description", 1000, "Describe the item.") ?? "";
    const hsnSac = lr.code("hsnSac", /^\d{4,8}$/, "Enter a 4 to 8 digit HSN or SAC code.", 8);
    const unitCode = lr.text("unitCode", 10);
    for (const [k, v] of Object.entries(lr.errors)) errors[`lines.${i}.${k}`] ??= v;
    const parsed = tax.ok ? tax.input.lines[i] : null;
    return {
      productId,
      serviceId,
      description,
      hsnSac,
      quantity: parsed?.quantity ?? "0",
      unitCode: unitCode?.toUpperCase() ?? null,
      ratePaise: parsed?.ratePaise ?? 0,
      discount: parsed?.discount ?? null,
      taxCategory: parsed?.taxCategory ?? "taxable",
      taxRate: parsed?.taxRate ?? "0",
      cessRate: parsed?.cessRate ?? "0",
    };
  });

  if (Object.keys(errors).length || !tax.ok) return { ok: false, errors };
  return {
    ok: true,
    values: {
      customerId: customerId!,
      issueDate: issueDate!,
      extraDate,
      invoiceId,
      reason,
      placeOfSupply: pos,
      pricesIncludeTax: tax.input.pricesIncludeTax,
      reverseCharge: tax.input.reverseCharge ?? false,
      zeroRated: tax.input.zeroRated ?? null,
      invoiceDiscount: tax.input.invoiceDiscount ?? null,
      charges: tax.input.charges ?? [],
      notes,
      terms,
      lines,
    },
  };
}
