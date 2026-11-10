// Payment and refund rules, shared by the forms and the APIs. Pure.

import { type FieldErrors, FieldReader } from "../fields";

export const PAYMENT_METHOD_OPTIONS = [
  { value: "upi", label: "UPI" },
  { value: "bank_transfer", label: "Bank transfer (NEFT/RTGS/IMPS)" },
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
  { value: "card", label: "Card" },
  { value: "other", label: "Other (gateway, wallet…)" },
] as const;
export type PaymentMethod = (typeof PAYMENT_METHOD_OPTIONS)[number]["value"];
const METHODS = PAYMENT_METHOD_OPTIONS.map((m) => m.value);

export const methodLabel = (m: string) => PAYMENT_METHOD_OPTIONS.find((o) => o.value === m)?.label ?? m;

export type AllocationValues = { invoiceId: string; amountPaise: number };

export type PaymentValues = {
  customerId: string;
  paymentDate: string;
  amountPaise: number;
  method: PaymentMethod;
  reference: string | null;
  notes: string | null;
  allocations: AllocationValues[];
};

export type RefundValues = {
  customerId: string;
  /** Exactly one source: an advance (payment) or an over-credited invoice (credit note). */
  paymentId: string | null;
  creditNoteId: string | null;
  refundDate: string;
  amountPaise: number;
  method: PaymentMethod;
  reference: string | null;
  notes: string | null;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function readDate(r: FieldReader, key: string): string | null {
  const v = r.text(key, 10, "Enter the date.");
  if (v && (!DATE_RE.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`)) || !new Date(`${v}T00:00:00Z`).toISOString().startsWith(v))) {
    r.fail(key, "Enter a date as YYYY-MM-DD.");
    return null;
  }
  return v;
}

/** Cheques and transfers should carry a reference (cheque or UTR number); cash needn't. */
function readCommon(r: FieldReader) {
  const method = r.oneOf("method", METHODS, "Choose how it was paid.");
  const reference = r.text("reference", 60);
  if (!reference && (method === "cheque" || method === "bank_transfer")) {
    r.fail("reference", method === "cheque" ? "Enter the cheque number." : "Enter the UTR or transaction reference.");
  }
  return { method, reference, notes: r.text("notes", 1000) };
}

/** Allocations arrive as [{ invoiceId, amount }] in rupees; zero rows are dropped. */
export function readAllocations(raw: unknown, errors: FieldErrors): AllocationValues[] {
  const list = Array.isArray(raw) ? raw : [];
  if (list.length > 200) errors.allocations = "Allocate to at most 200 invoices at once.";
  const out: AllocationValues[] = [];
  const seen = new Set<string>();
  list.slice(0, 200).forEach((item, i) => {
    const r = new FieldReader(item && typeof item === "object" ? (item as Record<string, unknown>) : {});
    const invoiceId = r.id("invoiceId", "Choose an invoice.");
    const amountPaise = r.rupees("amount") ?? 0;
    for (const [k, v] of Object.entries(r.errors)) errors[`allocations.${i}.${k}`] ??= v;
    if (!invoiceId || amountPaise === 0) return;
    if (seen.has(invoiceId)) errors[`allocations.${i}.invoiceId`] ??= "This invoice is listed twice.";
    seen.add(invoiceId);
    out.push({ invoiceId, amountPaise });
  });
  return out;
}

export function validatePayment(raw: Record<string, unknown>): { ok: true; values: PaymentValues } | { ok: false; errors: FieldErrors } {
  const r = new FieldReader(raw);
  const customerId = r.id("customerId", "Choose a customer.");
  const paymentDate = readDate(r, "paymentDate");
  const amountPaise = r.rupees("amount", { required: "Enter the amount received." }) ?? 0;
  if (!r.has("amount") && amountPaise <= 0) r.fail("amount", "Enter an amount more than zero.");
  const common = readCommon(r);
  const allocations = readAllocations(raw.allocations, r.errors);
  const allocated = allocations.reduce((a, x) => a + x.amountPaise, 0);
  if (allocated > amountPaise && !r.has("amount")) r.fail("allocations", "You've allocated more than the amount received.");
  if (!r.ok) return { ok: false, errors: r.errors };
  return { ok: true, values: { customerId: customerId!, paymentDate: paymentDate!, amountPaise, ...common, allocations } };
}

export function validateRefund(raw: Record<string, unknown>): { ok: true; values: RefundValues } | { ok: false; errors: FieldErrors } {
  const r = new FieldReader(raw);
  const customerId = r.id("customerId", "Choose a customer.");
  const paymentId = r.id("paymentId");
  const creditNoteId = r.id("creditNoteId");
  if (!paymentId === !creditNoteId) r.fail("source", "Refund either an advance payment or a credit note.");
  const refundDate = readDate(r, "refundDate");
  const amountPaise = r.rupees("amount", { required: "Enter the amount refunded." }) ?? 0;
  if (!r.has("amount") && amountPaise <= 0) r.fail("amount", "Enter an amount more than zero.");
  const common = readCommon(r);
  if (!r.ok) return { ok: false, errors: r.errors };
  return { ok: true, values: { customerId: customerId!, paymentId, creditNoteId, refundDate: refundDate!, amountPaise, ...common } };
}

/** Client-generated key that makes a submit safe to retry (UUID-ish, 8–80 chars). */
export function readIdempotencyKey(header: string | null): string | null {
  if (!header) return null;
  const k = header.trim();
  return /^[A-Za-z0-9_-]{8,80}$/.test(k) ? k : null;
}

export type SupplierPaymentInput = {
  supplierId: string;
  paymentDate: string;
  amountPaise: number;
  method: PaymentMethod;
  reference: string | null;
  notes: string | null;
  allocations: { billId: string; amountPaise: number }[];
};

/** Bill allocations arrive as [{ billId, amount }] in rupees; zero rows are dropped. */
export function readBillAllocations(raw: unknown, errors: FieldErrors) {
  const asInvoices = (Array.isArray(raw) ? raw : []).map((x) =>
    x && typeof x === "object" ? { invoiceId: (x as Record<string, unknown>).billId, amount: (x as Record<string, unknown>).amount } : x,
  );
  const found: FieldErrors = {};
  const list = readAllocations(asInvoices, found);
  for (const [k, v] of Object.entries(found)) errors[k.replace(".invoiceId", ".billId")] ??= v;
  return list.map((a) => ({ billId: a.invoiceId, amountPaise: a.amountPaise }));
}

/** A payment made to a supplier, optionally set against their bills. */
export function validateSupplierPayment(raw: Record<string, unknown>): { ok: true; values: SupplierPaymentInput } | { ok: false; errors: FieldErrors } {
  const r = new FieldReader(raw);
  const supplierId = r.id("supplierId", "Choose a supplier.");
  const paymentDate = readDate(r, "paymentDate");
  const amountPaise = r.rupees("amount", { required: "Enter the amount paid." }) ?? 0;
  if (!r.has("amount") && amountPaise <= 0) r.fail("amount", "Enter an amount more than zero.");
  const common = readCommon(r);
  const allocations = readBillAllocations(raw.allocations, r.errors);
  if (allocations.reduce((a, x) => a + x.amountPaise, 0) > amountPaise && !r.has("amount")) r.fail("allocations", "You've allocated more than the amount paid.");
  if (!r.ok) return { ok: false, errors: r.errors };
  return { ok: true, values: { supplierId: supplierId!, paymentDate: paymentDate!, amountPaise, ...common, allocations } };
}
