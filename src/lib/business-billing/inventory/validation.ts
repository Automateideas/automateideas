import { FieldReader, type FieldErrors } from "../fields";

// Inventory inputs and quantity arithmetic. Pure: the browser checks forms
// with it and the API checks again. Quantities have up to 3 decimals, so all
// arithmetic is done in whole thousandths ("milli") to avoid rounding drift.

type Result<T> = { ok: true; values: T } | { ok: false; errors: FieldErrors };

/** "2.500" → 2500. */
export const toMilli = (q: string | number | null | undefined) => Math.round(Number(q ?? 0) * 1000);
/** 2500 → "2.500" (what numeric(15,3) columns take). */
export const fromMilli = (m: number) => (m / 1000).toFixed(3);
/** 2500 → "2.5" for display. */
export const showQty = (m: number) => (m / 1000).toLocaleString("en-IN", { maximumFractionDigits: 3 });

/** Value of `qtyMilli` units at `costPaisePerUnit`, whole paise. */
export const valueOf = (qtyMilli: number, costPaisePerUnit: number) => Math.round((qtyMilli * costPaisePerUnit) / 1000);

/** Weighted average cost per unit from totals, or `fallback` when there's no positive stock. */
export const averageCost = (qtyMilli: number, valuePaise: number, fallback: number) => (qtyMilli > 0 ? (valuePaise * 1000) / qtyMilli : fallback);

/** Same list as STOCK_ADJUSTMENT_REASONS in the schema (a test keeps them equal); kept here so pages don't load the schema. */
export const ADJUSTMENT_REASONS = ["opening", "count", "damaged", "lost", "expired", "found", "internal_use", "other"] as const;
export type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number];

export const ADJUSTMENT_REASON_LABELS: Record<AdjustmentReason, string> = {
  opening: "Opening stock",
  count: "Stock count correction",
  damaged: "Damaged",
  lost: "Lost or stolen",
  expired: "Expired",
  found: "Found",
  internal_use: "Used internally",
  other: "Other",
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (v: string) => DATE_RE.test(v) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v);
const QTY_RE = /^-?\d{1,12}(\.\d{1,3})?$/;

/** A quantity with up to 3 decimals, in milli units; null when blank or bad (error recorded). */
function readQty(r: FieldReader, key: string, opts: { allowNegative: boolean; required: string }): number | null {
  const v = r.value(key);
  const s = typeof v === "number" ? String(v) : typeof v === "string" ? v.trim().replace(/,/g, "") : "";
  if (!s) {
    r.fail(key, opts.required);
    return null;
  }
  if (!QTY_RE.test(s) || (!opts.allowNegative && s.startsWith("-"))) {
    r.fail(key, opts.allowNegative ? "Enter a quantity like 5, 2.5 or -3." : "Enter a quantity like 5 or 2.5.");
    return null;
  }
  const m = toMilli(s);
  if (m === 0) {
    r.fail(key, "Enter a quantity other than zero.");
    return null;
  }
  return m;
}

/* ---------------- Warehouses ---------------- */

export type WarehouseValues = { code: string; name: string; addressLine1: string | null; city: string | null; stateCode: string | null; postalCode: string | null };

export function validateWarehouse(raw: Record<string, unknown>): Result<WarehouseValues> {
  const r = new FieldReader(raw);
  const code = r.text("code", 20, "Enter a short code, e.g. MAIN or PUNE.");
  if (code && !/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(code)) r.fail("code", "Use letters, digits, '-' or '_' (no spaces).");
  const name = r.text("name", 120, "Enter the warehouse name.");
  const addressLine1 = r.text("addressLine1", 200);
  const city = r.text("city", 80);
  const stateCode = r.text("stateCode", 2);
  if (stateCode && !/^\d{2}$/.test(stateCode)) r.fail("stateCode", "Choose a state.");
  const postalCode = r.text("postalCode", 10);
  if (postalCode && !/^\d{6}$/.test(postalCode)) r.fail("postalCode", "Enter a 6-digit PIN code.");
  if (!r.ok) return { ok: false, errors: r.errors };
  return { ok: true, values: { code: code!.toUpperCase(), name: name!, addressLine1, city, stateCode, postalCode } };
}

/* ---------------- Adjustments and transfers ---------------- */

export type AdjustmentLine = { productId: string; quantityMilli: number; unitCostPaise: number | null; note: string | null };
export type AdjustmentValues = {
  date: string;
  kind: "adjustment" | "transfer";
  warehouseId: string;
  toWarehouseId: string | null;
  reason: AdjustmentReason | null;
  notes: string | null;
  lines: AdjustmentLine[];
};

export const MAX_ADJUSTMENT_LINES = 200;

/**
 * { date, kind: "adjustment" | "transfer", warehouseId, toWarehouseId?, reason?, notes?,
 *   lines: [{ productId, quantity, unitCost?, note? }] }
 * Adjustment quantities are signed (+ adds, − removes); transfer quantities are positive.
 * unitCost (rupees) only for stock added; blank = current average cost.
 */
export function validateAdjustment(raw: Record<string, unknown>): Result<AdjustmentValues> {
  const r = new FieldReader(raw);
  const date = r.text("date", 10, "Enter the date.");
  if (date && !isDate(date)) r.fail("date", "Enter a date as YYYY-MM-DD.");
  const kind = r.oneOf("kind", ["adjustment", "transfer"] as const, "Choose adjustment or transfer.", "adjustment");
  const warehouseId = r.id("warehouseId", kind === "transfer" ? "Choose where the stock leaves from." : "Choose the warehouse.");
  const toWarehouseId = kind === "transfer" ? r.id("toWarehouseId", "Choose where the stock goes.") : null;
  if (kind === "transfer" && warehouseId && toWarehouseId && warehouseId === toWarehouseId) r.fail("toWarehouseId", "Choose a different warehouse.");
  const reason = kind === "adjustment" ? r.oneOf("reason", ADJUSTMENT_REASONS, "Choose a reason.") : null;
  const notes = r.text("notes", 1000);
  const errors: FieldErrors = { ...r.errors };

  const list = Array.isArray(raw.lines) ? raw.lines : [];
  if (list.length > MAX_ADJUSTMENT_LINES) errors.lines = `Use at most ${MAX_ADJUSTMENT_LINES} lines.`;
  const lines: AdjustmentLine[] = [];
  const seen = new Set<string>();
  list.slice(0, MAX_ADJUSTMENT_LINES).forEach((item, i) => {
    const o = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    const blank = !o.productId && (o.quantity === undefined || o.quantity === null || o.quantity === "");
    if (blank) return;
    const lr = new FieldReader(o);
    const productId = lr.id("productId", "Choose a product.");
    const quantityMilli = readQty(lr, "quantity", { allowNegative: kind === "adjustment", required: "Enter the quantity." });
    const unitCostPaise = lr.rupees("unitCost");
    if (unitCostPaise !== null && quantityMilli !== null && quantityMilli < 0) lr.fail("unitCost", "A cost is only needed for stock added.");
    const note = lr.text("note", 200);
    if (productId && seen.has(productId)) lr.fail("productId", "This product is listed twice.");
    if (productId) seen.add(productId);
    for (const [k, v] of Object.entries(lr.errors)) errors[`lines.${i}.${k}`] ??= v;
    if (lr.ok) lines.push({ productId: productId!, quantityMilli: quantityMilli!, unitCostPaise, note });
  });
  if (!lines.length && !Object.keys(errors).some((k) => k.startsWith("lines."))) errors.lines ??= "Add at least one product.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, values: { date: date!, kind, warehouseId: warehouseId!, toWarehouseId, reason, notes, lines } };
}
