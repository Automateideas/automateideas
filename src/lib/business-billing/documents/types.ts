// The five sales documents, described once. Pure (shared with the browser).

import type { BusinessBillingPermission } from "@/lib/roles";

import type { NumberedDocument } from "../numbering-format";

export const DOCUMENT_SLUGS = ["invoices", "quotations", "sales-orders", "credit-notes", "debit-notes"] as const;
export type DocumentSlug = (typeof DOCUMENT_SLUGS)[number];

export type DocumentTypeConfig = {
  slug: DocumentSlug;
  /** Key used for numbering (invoice_sequences.document_type). */
  numbering: NumberedDocument;
  singular: string;
  plural: string;
  /** Permission to create, edit, issue and void. Reading needs billing.view. */
  permission: BusinessBillingPermission;
  /** Status a draft moves to when issued, and the button that does it. */
  issuedStatus: string;
  issueLabel: string;
  statuses: readonly string[];
  /** Optional second date on the document. */
  extraDate: { key: "dueDate" | "validUntil" | "expectedDate"; label: string } | null;
  /** Credit and debit notes must point at an issued invoice. */
  needsInvoice: boolean;
  /** What this document can be turned into, as a new draft. */
  convertsTo: readonly DocumentSlug[];
};

export const DOCUMENT_TYPES: Record<DocumentSlug, DocumentTypeConfig> = {
  invoices: {
    slug: "invoices",
    numbering: "invoice",
    singular: "Invoice",
    plural: "Invoices",
    permission: "billing.invoices.manage",
    issuedStatus: "issued",
    issueLabel: "Issue invoice",
    statuses: ["draft", "issued", "partially_paid", "paid", "void"],
    extraDate: { key: "dueDate", label: "Due date" },
    needsInvoice: false,
    convertsTo: ["credit-notes", "debit-notes"],
  },
  quotations: {
    slug: "quotations",
    numbering: "quotation",
    singular: "Quotation",
    plural: "Quotations",
    permission: "billing.quotations.manage",
    issuedStatus: "sent",
    issueLabel: "Finalise quotation",
    statuses: ["draft", "sent", "accepted", "declined", "expired", "converted", "void"],
    extraDate: { key: "validUntil", label: "Valid until" },
    needsInvoice: false,
    convertsTo: ["sales-orders", "invoices"],
  },
  "sales-orders": {
    slug: "sales-orders",
    numbering: "sales_order",
    singular: "Sales order",
    plural: "Sales orders",
    permission: "billing.invoices.manage",
    issuedStatus: "confirmed",
    issueLabel: "Confirm order",
    statuses: ["draft", "confirmed", "fulfilled", "invoiced", "void"],
    extraDate: { key: "expectedDate", label: "Expected delivery" },
    needsInvoice: false,
    convertsTo: ["invoices"],
  },
  "credit-notes": {
    slug: "credit-notes",
    numbering: "credit_note",
    singular: "Credit note",
    plural: "Credit notes",
    permission: "billing.invoices.manage",
    issuedStatus: "issued",
    issueLabel: "Issue credit note",
    statuses: ["draft", "issued", "void"],
    extraDate: null,
    needsInvoice: true,
    convertsTo: [],
  },
  "debit-notes": {
    slug: "debit-notes",
    numbering: "debit_note",
    singular: "Debit note",
    plural: "Debit notes",
    permission: "billing.invoices.manage",
    issuedStatus: "issued",
    issueLabel: "Issue debit note",
    statuses: ["draft", "issued", "void"],
    extraDate: null,
    needsInvoice: true,
    convertsTo: [],
  },
};

export const isDocumentSlug = (s: string): s is DocumentSlug => (DOCUMENT_SLUGS as readonly string[]).includes(s);

export const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  issued: "Issued",
  partially_paid: "Partly paid",
  paid: "Paid",
  void: "Void",
  sent: "Sent",
  accepted: "Accepted",
  declined: "Declined",
  expired: "Expired",
  converted: "Converted",
  confirmed: "Confirmed",
  fulfilled: "Fulfilled",
  invoiced: "Invoiced",
  overdue: "Overdue",
};

/** Statuses a quotation can be moved to by hand after it's sent. */
export const QUOTATION_RESPONSES = ["accepted", "declined"] as const;

/**
 * The status to show: issued invoices past their due date are "overdue",
 * and sent quotations past their validity are "expired" (computed, not stored).
 */
export function displayStatus(slug: DocumentSlug, status: string, extraDate: string | null, today: string): string {
  if (slug === "invoices" && (status === "issued" || status === "partially_paid") && extraDate && extraDate < today) return "overdue";
  if (slug === "quotations" && status === "sent" && extraDate && extraDate < today) return "expired";
  return status;
}

/** Today in India as YYYY-MM-DD. */
export function todayInIndia(at: Date = new Date()): string {
  return new Date(at.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

/* ---------------- Amount in words (Indian numbering) ---------------- */

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function below1000(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${ONES[h]} Hundred`);
  if (r) parts.push(r < 20 ? ONES[r] : `${TENS[Math.floor(r / 10)]}${r % 10 ? ` ${ONES[r % 10]}` : ""}`);
  return parts.join(" ");
}

function wholeNumber(n: number): string {
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 1_00_00_000);
  const lakh = Math.floor((n % 1_00_00_000) / 1_00_000);
  const thousand = Math.floor((n % 1_00_000) / 1000);
  const rest = n % 1000;
  if (crore) parts.push(`${wholeNumber(crore)} Crore`);
  if (lakh) parts.push(`${below1000(lakh)} Lakh`);
  if (thousand) parts.push(`${below1000(thousand)} Thousand`);
  if (rest) parts.push(below1000(rest));
  return parts.join(" ");
}

/** 123456 paise → "Rupees One Thousand Two Hundred Thirty Four and Fifty Six Paise Only". */
export function amountInWords(paise: number): string {
  const negative = paise < 0;
  const abs = Math.abs(Math.trunc(paise));
  const rupees = Math.floor(abs / 100);
  const p = abs % 100;
  const words = `Rupees ${wholeNumber(rupees)}${p ? ` and ${below1000(p)} Paise` : ""} Only`;
  return negative ? `Minus ${words}` : words;
}
