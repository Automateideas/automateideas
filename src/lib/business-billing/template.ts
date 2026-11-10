// Document template settings: design, colour, bank and UPI details, defaults.
// Pure (shared by the settings form, the APIs, the on-screen document and the PDF).

import { type FieldErrors, FieldReader, IFSC_RE } from "./fields";

export const TEMPLATE_DESIGNS = [
  { value: "classic", label: "Classic", description: "Clean lines, black and white with a touch of colour. Prints well anywhere." },
  { value: "modern", label: "Modern", description: "A coloured header band and totals box in your brand colour." },
  { value: "compact", label: "Compact", description: "Smaller type and tighter rows, so long invoices fit on fewer pages." },
] as const;
export type TemplateDesign = (typeof TEMPLATE_DESIGNS)[number]["value"];

/** Suggested colours (the app's brand green first). Any #RRGGBB works. */
export const BRAND_COLORS = ["#04875A", "#1D4ED8", "#0F172A", "#AE1E2A", "#C2862E", "#7C3AED", "#0E7490"] as const;

export type BankDetails = { bankName: string; accountName: string; accountNumber: string; ifsc: string; branch: string | null };

export type DocumentTemplate = {
  design: TemplateDesign;
  /** #RRGGBB */
  color: string;
  bank: BankDetails | null;
  showBankDetails: boolean;
  /** e.g. business@okhdfc. Shown as a "scan to pay" QR on invoices with something due. */
  upiId: string | null;
  showUpiQr: boolean;
  showSignature: boolean;
  showStamp: boolean;
  /** Prefilled on new documents (each document can change them). */
  defaultTerms: string | null;
  defaultNotes: string | null;
  /** A line at the bottom of every page, e.g. "Thank you for your business". */
  footer: string | null;
};

export const DEFAULT_TEMPLATE: DocumentTemplate = {
  design: "classic",
  color: "#04875A",
  bank: null,
  showBankDetails: true,
  upiId: null,
  showUpiQr: true,
  showSignature: true,
  showStamp: true,
  defaultTerms: null,
  defaultNotes: null,
  footer: null,
};

const COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
// UPI virtual payment address: handle@psp.
export const UPI_RE = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9]{1,63}$/;

export function validateTemplate(raw: Record<string, unknown>): { ok: true; values: DocumentTemplate } | { ok: false; errors: FieldErrors } {
  const r = new FieldReader(raw);
  const design = r.oneOf("design", TEMPLATE_DESIGNS.map((d) => d.value), "Choose a design.", "classic");
  const color = (r.text("color", 7) ?? DEFAULT_TEMPLATE.color).toUpperCase();
  if (!COLOR_RE.test(color)) r.fail("color", "Use a colour like #04875A.");

  // Bank details: all main fields or none.
  const b = raw.bank && typeof raw.bank === "object" ? (raw.bank as Record<string, unknown>) : {};
  const br = new FieldReader(b);
  const bankName = br.text("bankName", 100);
  const accountName = br.text("accountName", 200);
  const accountNumber = br.code("accountNumber", /^\d{6,18}$/, "Enter a 6 to 18 digit account number.", 18);
  const ifsc = br.code("ifsc", IFSC_RE, "Enter a valid 11-character IFSC, e.g. HDFC0001234.", 11);
  const branch = br.text("branch", 100);
  const anyBank = bankName || accountName || accountNumber || ifsc || branch;
  if (anyBank) {
    if (!bankName) br.fail("bankName", "Enter the bank's name.");
    if (!accountName) br.fail("accountName", "Enter the account holder's name.");
    if (!accountNumber && !br.has("accountNumber")) br.fail("accountNumber", "Enter the account number.");
    if (!ifsc && !br.has("ifsc")) br.fail("ifsc", "Enter the IFSC.");
  }
  for (const [k, v] of Object.entries(br.errors)) r.fail(`bank.${k}`, v);

  const upiRaw = r.text("upiId", 320);
  const upiId = upiRaw ? upiRaw.toLowerCase() : null;
  if (upiId && !UPI_RE.test(upiId)) r.fail("upiId", "Enter a UPI ID like business@okhdfc.");

  const values: DocumentTemplate = {
    design,
    color,
    bank: anyBank ? { bankName: bankName!, accountName: accountName!, accountNumber: accountNumber!, ifsc: ifsc!, branch } : null,
    showBankDetails: r.bool("showBankDetails", true),
    upiId,
    showUpiQr: r.bool("showUpiQr", true),
    showSignature: r.bool("showSignature", true),
    showStamp: r.bool("showStamp", true),
    defaultTerms: r.text("defaultTerms", 4000),
    defaultNotes: r.text("defaultNotes", 2000),
    footer: r.text("footer", 200),
  };
  return r.ok ? { ok: true, values } : { ok: false, errors: r.errors };
}

/** Stored settings over the defaults; anything invalid falls back to the default. */
export function templateFrom(stored: unknown): DocumentTemplate {
  if (!stored || typeof stored !== "object") return DEFAULT_TEMPLATE;
  const r = validateTemplate(stored as Record<string, unknown>);
  return r.ok ? r.values : DEFAULT_TEMPLATE;
}

/**
 * A UPI payment link (NPCI deep-link format) for a QR code:
 * upi://pay?pa=<id>&pn=<payee>&am=<rupees>&cu=INR&tn=<note>
 */
export function upiPayLink({ upiId, payeeName, amountPaise, note }: { upiId: string; payeeName: string; amountPaise: number; note: string }) {
  const params = new URLSearchParams({
    pa: upiId,
    pn: payeeName.slice(0, 50),
    am: (amountPaise / 100).toFixed(2),
    cu: "INR",
    tn: note.slice(0, 50),
  });
  return `upi://pay?${params.toString().replace(/\+/g, "%20")}`;
}

/** Lighter tint of a colour (for table headers), mixing with white. */
export function tint(hex: string, amount = 0.9) {
  const n = Number.parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(mix);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1).toUpperCase()}`;
}
