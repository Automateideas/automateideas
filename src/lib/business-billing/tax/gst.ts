// Indian GST engine. Pure and deterministic: the same input always gives the
// same paise. Invoices, quotations, notes and purchase bills all use it, and
// the server always recalculates (never trusts totals sent by a browser).
//
// Order of work (per line):
//   gross = quantity × rate
//   − item discount
//   − share of the invoice discount (split by value, so tax is charged on the
//     reduced value, as GST requires)
//   = net amount → taxable value and tax (CGST + SGST, or IGST) + cess
// Then additional charges (each with its own GST rate), then round-off.
//
// With "prices include GST", the entered amounts already contain tax; the
// taxable value is worked back out and the line total stays exactly what was
// entered. Each tax component is rounded to the paisa on its own line.

import { allocate, mulDivRound, toPaise, toScaled } from "./decimal";

export type TaxCategory = "taxable" | "exempt" | "nil_rated" | "non_gst";
export type SupplyType = "intra_state" | "inter_state" | "export";
export type Discount = { type: "percent"; percent: string } | { type: "amount"; paise: number };

/** Place of supply code for customers outside India (GST state code 96). */
export const OUTSIDE_INDIA = "96";

export type LineInput = {
  /** Up to 3 decimals, e.g. "2.5". */
  quantity: string;
  /** Per unit, in paise, as entered (with or without GST per `pricesIncludeTax`). */
  ratePaise: number;
  discount?: Discount | null;
  /** GST %, up to 4 decimals, e.g. "18". */
  taxRate: string;
  /** Cess %, up to 4 decimals. */
  cessRate?: string;
  taxCategory?: TaxCategory;
};

export type ChargeInput = { label: string; amountPaise: number; taxRate: string };

export type DocumentTaxInput = {
  /** The seller's GST state code. Needed when the seller is registered. */
  sellerStateCode: string | null;
  /** False for businesses without GST registration: no GST is charged. */
  sellerRegistered: boolean;
  /** GST state code of the place of supply; "96" or null = outside India. */
  placeOfSupply: string | null;
  pricesIncludeTax: boolean;
  /**
   * Exports and SEZ supplies. "lut": no GST (under bond / LUT).
   * "with_payment": IGST charged (refund claimed later).
   */
  zeroRated?: "lut" | "with_payment" | null;
  /** The recipient pays the GST: tax is shown but not added to the total. */
  reverseCharge?: boolean;
  invoiceDiscount?: Discount | null;
  charges?: ChargeInput[];
  roundOff: "nearest_rupee" | "none";
  lines: LineInput[];
};

export type TaxAmounts = { taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; cessPaise: number };

export type LineResult = TaxAmounts & {
  grossPaise: number;
  itemDiscountPaise: number;
  invoiceDiscountPaise: number;
  /** GST % actually applied (0 for exempt, nil-rated, non-GST, LUT exports or unregistered sellers). */
  appliedTaxRate: string;
  appliedCessRate: string;
  taxCategory: TaxCategory;
  /** Taxable value + tax (what the line adds to the bill, before reverse charge). */
  totalPaise: number;
};

export type ChargeResult = TaxAmounts & { label: string; amountPaise: number; appliedTaxRate: string; totalPaise: number };

export type RateSummary = TaxAmounts & { taxRate: string };

export type DocumentTaxResult = {
  supplyType: SupplyType;
  lines: LineResult[];
  charges: ChargeResult[];
  /** Sum of quantity × rate, as entered. */
  grossPaise: number;
  itemDiscountPaise: number;
  invoiceDiscountPaise: number;
  /** Taxable value of lines and charges. */
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  cessPaise: number;
  /** All GST and cess. */
  taxPaise: number;
  /** Tax the recipient pays under reverse charge (not in totalPaise). */
  reverseChargeTaxPaise: number;
  roundOffPaise: number;
  /** Amount payable. */
  totalPaise: number;
  /** By GST rate, for the tax table on the invoice and GST returns. */
  byRate: RateSummary[];
  /** Exempt, nil-rated and non-GST values, reported separately in GSTR-1. */
  exemptPaise: number;
  nilRatedPaise: number;
  nonGstPaise: number;
};

/** A problem with the input, with the field it concerns (e.g. "lines.2.quantity"). */
export class TaxInputError extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
  }
}

const RATE_SCALE = 4;
const QTY_SCALE = 3;
const HUNDRED = BigInt(100) * BigInt(10) ** BigInt(RATE_SCALE); // 100% at rate scale

function rate(value: string | undefined, field: string, max: number): bigint {
  const v = toScaled(value ?? "0", RATE_SCALE);
  if (v === null || v > BigInt(max) * BigInt(10) ** BigInt(RATE_SCALE)) throw new TaxInputError(field, `Enter a rate from 0 to ${max}.`);
  return v;
}

function paise(value: number, field: string): bigint {
  if (!Number.isSafeInteger(value) || value < 0) throw new TaxInputError(field, "Enter an amount of 0 or more.");
  return BigInt(value);
}

const rateString = (v: bigint) => {
  const s = (Number(v) / 10 ** RATE_SCALE).toFixed(RATE_SCALE);
  return s.replace(/\.?0+$/, "");
};

function discountOf(d: Discount | null | undefined, base: bigint, field: string): bigint {
  if (!d) return BigInt(0);
  let amount: bigint;
  if (d.type === "percent") {
    const pct = rate(d.percent, field, 100);
    amount = mulDivRound(base, pct, HUNDRED);
  } else if (d.type === "amount") {
    amount = paise(d.paise, field);
  } else {
    throw new TaxInputError(field, "Choose a percent or an amount.");
  }
  if (amount > base) throw new TaxInputError(field, "The discount is more than the amount.");
  return amount;
}

export function supplyTypeFor(input: Pick<DocumentTaxInput, "sellerStateCode" | "placeOfSupply" | "sellerRegistered">): SupplyType {
  const pos = input.placeOfSupply;
  if (!pos || pos === OUTSIDE_INDIA) return "export";
  if (input.sellerRegistered && !input.sellerStateCode) {
    throw new TaxInputError("sellerStateCode", "Set your business state in Billing → Settings → Tax.");
  }
  return !input.sellerStateCode || input.sellerStateCode === pos ? "intra_state" : "inter_state";
}

type Taxed = TaxAmounts & { totalPaise: number };

/** Taxable value and tax for one net amount. */
function taxFor(net: bigint, gst: bigint, cess: bigint, inclusive: boolean, supply: SupplyType): Taxed {
  const components = (taxable: bigint) => {
    const intra = supply === "intra_state";
    const cgst = intra ? mulDivRound(taxable, gst, BigInt(2) * HUNDRED) : BigInt(0);
    const sgst = intra ? mulDivRound(taxable, gst, BigInt(2) * HUNDRED) : BigInt(0);
    const igst = intra ? BigInt(0) : mulDivRound(taxable, gst, HUNDRED);
    const cessAmt = mulDivRound(taxable, cess, HUNDRED);
    return { cgst, sgst, igst, cess: cessAmt, tax: cgst + sgst + igst + cessAmt };
  };

  let taxable = inclusive ? mulDivRound(net, HUNDRED, HUNDRED + gst + cess) : net;
  const c = components(taxable);
  // Inclusive prices: keep the line total equal to what was entered.
  if (inclusive) taxable = net - c.tax;
  return {
    taxablePaise: toPaise(taxable),
    cgstPaise: toPaise(c.cgst),
    sgstPaise: toPaise(c.sgst),
    igstPaise: toPaise(c.igst),
    cessPaise: toPaise(c.cess),
    totalPaise: toPaise(taxable + c.tax),
  };
}

/** Calculates every line, charge and total of a GST document. Throws TaxInputError for bad input. */
export function calculateGst(input: DocumentTaxInput): DocumentTaxResult {
  if (!input.lines.length) throw new TaxInputError("lines", "Add at least one item.");
  if (input.lines.length > 500) throw new TaxInputError("lines", "A document can have up to 500 items.");
  if (input.reverseCharge && input.pricesIncludeTax) {
    throw new TaxInputError("pricesIncludeTax", "Under reverse charge, enter prices without GST.");
  }
  const supply = supplyTypeFor(input);
  const zeroRatedLut = input.zeroRated === "lut";
  // SEZ supplies inside India are zero-rated too, and always treated as inter-state (IGST).
  const effectiveSupply: SupplyType = input.zeroRated ? (supply === "export" ? "export" : "inter_state") : supply;
  const noTax = !input.sellerRegistered || zeroRatedLut;
  const inclusive = input.pricesIncludeTax;

  // 1. Gross and item discounts.
  const prepared = input.lines.map((l, i) => {
    const qty = toScaled(l.quantity, QTY_SCALE);
    if (qty === null || qty > BigInt(10) ** BigInt(12) * BigInt(10) ** BigInt(QTY_SCALE)) throw new TaxInputError(`lines.${i}.quantity`, "Enter a quantity of 0 or more, up to 3 decimals.");
    const unit = paise(l.ratePaise, `lines.${i}.rate`);
    const gross = mulDivRound(qty, unit, BigInt(10) ** BigInt(QTY_SCALE));
    const itemDiscount = discountOf(l.discount, gross, `lines.${i}.discount`);
    const category = l.taxCategory ?? "taxable";
    if (!["taxable", "exempt", "nil_rated", "non_gst"].includes(category)) throw new TaxInputError(`lines.${i}.taxCategory`, "Unknown tax category.");
    const gst = rate(l.taxRate, `lines.${i}.taxRate`, 100);
    const cess = rate(l.cessRate, `lines.${i}.cessRate`, 400);
    const taxed = category === "taxable" && !noTax;
    return { gross, itemDiscount, afterItem: gross - itemDiscount, category, gst: taxed ? gst : BigInt(0), cess: taxed ? cess : BigInt(0) };
  });

  // 2. Invoice discount, split across lines by value.
  const base = prepared.reduce((a, p) => a + p.afterItem, BigInt(0));
  const invoiceDiscount = discountOf(input.invoiceDiscount, base, "invoiceDiscount");
  const shares = allocate(invoiceDiscount, prepared.map((p) => p.afterItem));

  // 3. Tax per line.
  const lines: LineResult[] = prepared.map((p, i) => {
    const net = p.afterItem - shares[i];
    const t = taxFor(net, p.gst, p.cess, inclusive, effectiveSupply);
    return {
      ...t,
      grossPaise: toPaise(p.gross),
      itemDiscountPaise: toPaise(p.itemDiscount),
      invoiceDiscountPaise: toPaise(shares[i]),
      appliedTaxRate: rateString(p.gst),
      appliedCessRate: rateString(p.cess),
      taxCategory: p.category as TaxCategory,
    };
  });

  // 4. Additional charges (shipping, packing…), each with its own rate.
  const charges: ChargeResult[] = (input.charges ?? []).map((c, i) => {
    const amount = paise(c.amountPaise, `charges.${i}.amount`);
    const gst = noTax ? BigInt(0) : rate(c.taxRate, `charges.${i}.taxRate`, 100);
    if (!c.label?.trim()) throw new TaxInputError(`charges.${i}.label`, "Name the charge, e.g. Shipping.");
    return { label: c.label.trim(), amountPaise: toPaise(amount), appliedTaxRate: rateString(gst), ...taxFor(amount, gst, BigInt(0), inclusive, effectiveSupply) };
  });

  // 5. Totals.
  const all: Taxed[] = [...lines, ...charges];
  const sum = (k: keyof Taxed) => all.reduce((a, x) => a + BigInt(x[k]), BigInt(0));
  const taxable = sum("taxablePaise");
  const cgst = sum("cgstPaise");
  const sgst = sum("sgstPaise");
  const igst = sum("igstPaise");
  const cess = sum("cessPaise");
  const tax = cgst + sgst + igst + cess;
  const reverseCharge = !!input.reverseCharge && !noTax;
  const raw = taxable + (reverseCharge ? BigInt(0) : tax);
  const rounded = input.roundOff === "nearest_rupee" ? mulDivRound(raw, BigInt(1), BigInt(100)) * BigInt(100) : raw;

  // 6. Summary by rate (taxable lines and charges only).
  const byRateMap = new Map<string, RateSummary>();
  const addRate = (r: string, t: Taxed) => {
    const s = byRateMap.get(r) ?? { taxRate: r, taxablePaise: 0, cgstPaise: 0, sgstPaise: 0, igstPaise: 0, cessPaise: 0 };
    s.taxablePaise += t.taxablePaise;
    s.cgstPaise += t.cgstPaise;
    s.sgstPaise += t.sgstPaise;
    s.igstPaise += t.igstPaise;
    s.cessPaise += t.cessPaise;
    byRateMap.set(r, s);
  };
  lines.forEach((l) => l.taxCategory === "taxable" && addRate(l.appliedTaxRate, l));
  charges.forEach((c) => addRate(c.appliedTaxRate, c));
  const byCategory = (cat: TaxCategory) => lines.filter((l) => l.taxCategory === cat).reduce((a, l) => a + l.taxablePaise, 0);

  return {
    supplyType: effectiveSupply,
    lines,
    charges,
    grossPaise: toPaise(prepared.reduce((a, p) => a + p.gross, BigInt(0))),
    itemDiscountPaise: toPaise(prepared.reduce((a, p) => a + p.itemDiscount, BigInt(0))),
    invoiceDiscountPaise: toPaise(invoiceDiscount),
    taxablePaise: toPaise(taxable),
    cgstPaise: toPaise(cgst),
    sgstPaise: toPaise(sgst),
    igstPaise: toPaise(igst),
    cessPaise: toPaise(cess),
    taxPaise: toPaise(tax),
    reverseChargeTaxPaise: reverseCharge ? toPaise(tax) : 0,
    roundOffPaise: toPaise(rounded - raw),
    totalPaise: toPaise(rounded),
    byRate: [...byRateMap.values()].sort((a, b) => Number(a.taxRate) - Number(b.taxRate)),
    exemptPaise: byCategory("exempt"),
    nilRatedPaise: byCategory("nil_rated"),
    nonGstPaise: byCategory("non_gst"),
  };
}
