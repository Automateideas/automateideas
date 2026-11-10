// Sales and purchase documents, described once. Pure (shared with the browser).

import type { BusinessBillingPermission } from "@/lib/roles";

import type { NumberedDocument } from "../numbering-format";

export const DOCUMENT_SLUGS = ["invoices", "quotations", "sales-orders", "credit-notes", "debit-notes", "purchase-orders", "purchase-bills", "purchase-returns"] as const;
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
  /** Sales documents are with customers; purchase documents with suppliers. */
  group: "sales" | "purchases";
  party: "customer" | "supplier";
  /** Notes and returns must point at an issued document of this type (invoice or bill). */
  needsInvoice: boolean;
  source: DocumentSlug | null;
  /** The other side's own number for this document (a supplier's bill number). */
  partyReference: { label: string } | null;
  /** What this document can be turned into, as a new draft. */
  convertsTo: readonly DocumentSlug[];
};

export const DOCUMENT_TYPES: Record<DocumentSlug, DocumentTypeConfig> = {
  invoices: {
    slug: "invoices",
    group: "sales",
    party: "customer",
    source: null,
    partyReference: null,
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
    group: "sales",
    party: "customer",
    source: null,
    partyReference: null,
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
    group: "sales",
    party: "customer",
    source: null,
    partyReference: null,
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
    group: "sales",
    party: "customer",
    source: "invoices",
    partyReference: null,
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
    group: "sales",
    party: "customer",
    source: "invoices",
    partyReference: null,
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
  // Purchases: the supplier is the seller; your state is the place of supply.
  "purchase-orders": {
    slug: "purchase-orders",
    group: "purchases",
    party: "supplier",
    source: null,
    partyReference: null,
    numbering: "purchase_order",
    singular: "Purchase order",
    plural: "Purchase orders",
    permission: "billing.purchases.manage",
    issuedStatus: "sent",
    issueLabel: "Finalise purchase order",
    statuses: ["draft", "sent", "received", "billed", "void"],
    extraDate: { key: "expectedDate", label: "Expected delivery" },
    needsInvoice: false,
    convertsTo: ["purchase-bills"],
  },
  "purchase-bills": {
    slug: "purchase-bills",
    group: "purchases",
    party: "supplier",
    source: null,
    partyReference: { label: "Supplier's bill number" },
    numbering: "purchase_bill",
    singular: "Purchase bill",
    plural: "Purchase bills",
    permission: "billing.purchases.manage",
    issuedStatus: "recorded",
    issueLabel: "Record bill",
    statuses: ["draft", "recorded", "partially_paid", "paid", "void"],
    extraDate: { key: "dueDate", label: "Due date" },
    needsInvoice: false,
    convertsTo: ["purchase-returns"],
  },
  "purchase-returns": {
    slug: "purchase-returns",
    group: "purchases",
    party: "supplier",
    source: "purchase-bills",
    partyReference: null,
    numbering: "purchase_return",
    singular: "Purchase return",
    plural: "Purchase returns",
    permission: "billing.purchases.manage",
    issuedStatus: "issued",
    issueLabel: "Issue purchase return",
    statuses: ["draft", "issued", "void"],
    extraDate: null,
    needsInvoice: true,
    convertsTo: [],
  },
};


export const SALES_SLUGS = DOCUMENT_SLUGS.filter((s) => DOCUMENT_TYPES[s].group === "sales");
export const PURCHASE_SLUGS = DOCUMENT_SLUGS.filter((s) => DOCUMENT_TYPES[s].group === "purchases");

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
  recorded: "Recorded",
  billed: "Billed",
  received: "Received",
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
  if (slug === "purchase-bills" && (status === "recorded" || status === "partially_paid") && extraDate && extraDate < today) return "overdue";
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
