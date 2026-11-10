// Turns a request body (amounts in rupees, as typed) into tax engine input.
// Pure; shared by the calculate API now and the document APIs later.

import { type FieldErrors, FieldReader, stateByCode } from "../fields";
import { type ChargeInput, type Discount, type DocumentTaxInput, type LineInput, OUTSIDE_INDIA, type TaxCategory } from "./gst";

const CATEGORIES: readonly TaxCategory[] = ["taxable", "exempt", "nil_rated", "non_gst"];

export type TaxRequestOptions = Pick<DocumentTaxInput, "sellerStateCode" | "sellerRegistered" | "roundOff"> & {
  /** Used when the request doesn't say. */
  defaultPricesIncludeTax: boolean;
};

const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

function readDiscount(raw: unknown, key: string, errors: FieldErrors): Discount | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const r = new FieldReader(obj(raw));
  const type = r.oneOf("type", ["percent", "amount"] as const, "Choose percent or amount.");
  let d: Discount | null = null;
  if (type === "percent") {
    const pct = r.decimal("value", 4, 100, "Enter a percent from 0 to 100.");
    d = pct && pct !== "0" ? { type: "percent", percent: pct } : null;
  } else {
    const p = r.rupees("value");
    d = p ? { type: "amount", paise: p } : null;
  }
  for (const [k, v] of Object.entries(r.errors)) errors[`${key}.${k === "value" ? "value" : k}`] ??= v;
  return d;
}

export function parseTaxRequest(
  raw: Record<string, unknown>,
  opts: TaxRequestOptions,
): { ok: true; input: DocumentTaxInput } | { ok: false; errors: FieldErrors } {
  const r = new FieldReader(raw);
  const errors = r.errors;

  const pos = r.text("placeOfSupply", 2);
  // Required for registered sellers: a missing place of supply must never quietly mean "export".
  // Customers outside India use "96".
  if (pos ? pos !== OUTSIDE_INDIA && !stateByCode(pos) : opts.sellerRegistered) r.fail("placeOfSupply", "Choose the place of supply.");
  const pricesIncludeTax = r.bool("pricesIncludeTax", opts.defaultPricesIncludeTax);
  const reverseCharge = r.bool("reverseCharge");
  const zeroRatedRaw = raw.zeroRated ?? null;
  let zeroRated: DocumentTaxInput["zeroRated"] = null;
  if (zeroRatedRaw !== null && zeroRatedRaw !== "") {
    zeroRated = r.oneOf("zeroRated", ["lut", "with_payment"] as const, "Choose LUT or with payment of IGST.");
  }
  const invoiceDiscount = readDiscount(raw.invoiceDiscount, "invoiceDiscount", errors);

  const rawLines = Array.isArray(raw.lines) ? raw.lines : [];
  if (!rawLines.length) r.fail("lines", "Add at least one item.");
  if (rawLines.length > 500) r.fail("lines", "A document can have up to 500 items.");
  const lines: LineInput[] = rawLines.slice(0, 500).map((item, i) => {
    const lr = new FieldReader(obj(item));
    const quantity = lr.decimal("quantity", 3, 1e12, "Enter a quantity, up to 3 decimals.", true) ?? "0";
    const ratePaise = lr.rupees("rate", { required: "Enter a rate." }) ?? 0;
    const taxRate = lr.taxRate();
    const cessRate = lr.decimal("cessRate", 4, 400, "Enter a cess rate from 0 to 400.") ?? "0";
    const taxCategory = lr.oneOf("taxCategory", CATEGORIES, "Choose a tax category.", "taxable");
    for (const [k, v] of Object.entries(lr.errors)) errors[`lines.${i}.${k}`] ??= v;
    const discount = readDiscount(obj(item).discount, `lines.${i}.discount`, errors);
    return { quantity, ratePaise, taxRate, cessRate, taxCategory, discount };
  });

  const rawCharges = Array.isArray(raw.charges) ? raw.charges : [];
  if (rawCharges.length > 10) r.fail("charges", "Up to 10 additional charges.");
  const charges: ChargeInput[] = rawCharges.slice(0, 10).map((item, i) => {
    const cr = new FieldReader(obj(item));
    const label = cr.text("label", 60, "Name the charge, e.g. Shipping.") ?? "";
    const amountPaise = cr.rupees("amount", { required: "Enter an amount." }) ?? 0;
    const taxRate = cr.taxRate();
    for (const [k, v] of Object.entries(cr.errors)) errors[`charges.${i}.${k}`] ??= v;
    return { label, amountPaise, taxRate };
  });

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    input: {
      sellerStateCode: opts.sellerStateCode,
      sellerRegistered: opts.sellerRegistered,
      roundOff: opts.roundOff,
      placeOfSupply: pos,
      pricesIncludeTax,
      reverseCharge,
      zeroRated,
      invoiceDiscount,
      charges,
      lines,
    },
  };
}
