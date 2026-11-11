// Document number formats and financial years. Pure (shared with the browser).
// Numbers themselves are only ever handed out by the database (numbering.ts).

import { type FieldErrors, FieldReader } from "./fields";

/** Document types that get numbers, with their default prefixes. */
export const NUMBERED_DOCUMENTS = [
  { type: "invoice", label: "Invoices", prefix: "INV" },
  { type: "quotation", label: "Quotations", prefix: "QT" },
  { type: "sales_order", label: "Sales orders", prefix: "SO" },
  { type: "credit_note", label: "Credit notes", prefix: "CN" },
  { type: "debit_note", label: "Debit notes", prefix: "DN" },
  { type: "payment", label: "Payment receipts", prefix: "REC" },
  { type: "refund", label: "Refunds", prefix: "RF" },
  { type: "purchase_order", label: "Purchase orders", prefix: "PO" },
  { type: "purchase_bill", label: "Purchase bills", prefix: "PB" },
  { type: "purchase_return", label: "Purchase returns", prefix: "PR" },
  { type: "supplier_payment", label: "Supplier payments", prefix: "PAY" },
  { type: "journal_entry", label: "Journal entries", prefix: "JV" },
  { type: "stock_adjustment", label: "Stock adjustments", prefix: "SA" },
] as const;
export type NumberedDocument = (typeof NUMBERED_DOCUMENTS)[number]["type"];

export type NumberFormat = {
  /** Letters, numbers, - and / (GST rule 46); e.g. "ABC" or "INV-". */
  prefix: string;
  /** Adds "2026-27" after the prefix; numbering restarts every financial year either way. */
  includeFinancialYear: boolean;
  /** Minimum digits: 3 → 001. */
  padding: number;
};

export type NumberingSettings = Record<NumberedDocument, NumberFormat>;

export function defaultNumbering(invoicePrefix?: string): NumberingSettings {
  return Object.fromEntries(
    NUMBERED_DOCUMENTS.map((d) => [
      d.type,
      {
        // The invoice prefix from company settings (Stage 3) keeps working.
        prefix: d.type === "invoice" && invoicePrefix ? invoicePrefix.replace(/[^A-Za-z0-9/-]/g, "").replace(/[-/]+$/, "") || d.prefix : d.prefix,
        includeFinancialYear: true,
        padding: 4,
      },
    ]),
  ) as NumberingSettings;
}

/** Stored settings merged over the defaults (unknown or bad entries ignored). */
export function numberingFrom(stored: unknown, invoicePrefix?: string): NumberingSettings {
  const result = defaultNumbering(invoicePrefix);
  if (stored && typeof stored === "object") {
    for (const d of NUMBERED_DOCUMENTS) {
      const v = (stored as Record<string, unknown>)[d.type];
      const checked = validateNumberFormat(v);
      if (checked.ok) result[d.type] = checked.values;
    }
  }
  return result;
}

const PREFIX_RE = /^[A-Za-z0-9][A-Za-z0-9/-]{0,11}$/;
/** GST invoices: at most 16 characters, unique within the financial year. */
export const MAX_NUMBER_LENGTH = 16;

export function validateNumberFormat(raw: unknown): { ok: true; values: NumberFormat } | { ok: false; errors: FieldErrors } {
  const r = new FieldReader(raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {});
  const prefix = r.text("prefix", 12, "Enter a prefix, e.g. INV.") ?? "";
  if (prefix && !PREFIX_RE.test(prefix)) r.fail("prefix", "Use up to 12 letters, numbers, dashes or slashes.");
  const includeFinancialYear = r.bool("includeFinancialYear", true);
  const padding = r.int("padding", 1, 8, "Choose 1 to 8 digits.", true) ?? 4;
  if (r.ok) {
    const sample = formatDocumentNumber({ prefix, includeFinancialYear, padding }, "2026-27", 1);
    if (sample.length > MAX_NUMBER_LENGTH) {
      r.fail("prefix", `Numbers would be ${sample.length} characters (${sample}); GST allows ${MAX_NUMBER_LENGTH}. Shorten the prefix or digits.`);
    }
  }
  return r.ok ? { ok: true, values: { prefix, includeFinancialYear, padding } } : { ok: false, errors: r.errors };
}

/**
 * Financial year label for a date. April start: 10 Nov 2026 → "2026-27",
 * 15 Feb 2027 → "2026-27". January start: "2026".
 */
export function financialYearOf(date: Date, startMonth: number): string {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  if (startMonth === 1) return String(y);
  const start = m >= startMonth ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** The calendar date in India for a moment (documents are dated in IST). */
export function indiaDate(at: Date = new Date()): Date {
  const ist = new Date(at.getTime() + 330 * 60_000);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()));
}

/** ABC/2026-27/0001, or ABC/0001 without the year. Separator "/" (or "-" when the prefix ends in "-"). */
export function formatDocumentNumber(format: NumberFormat, financialYear: string, n: number): string {
  const digits = String(n).padStart(format.padding, "0");
  const parts = [format.prefix.replace(/[-/]+$/, ""), format.includeFinancialYear ? financialYear : null, digits].filter(Boolean);
  const sep = format.prefix.endsWith("-") ? "-" : "/";
  return parts.join(sep);
}
