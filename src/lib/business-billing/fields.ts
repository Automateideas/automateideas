// Field rules shared by Business Billing forms and APIs (customers, suppliers,
// catalogue). Pure (no server imports), so the browser can use it too.

import { isEmail } from "@/app/(auth)/_lib/validate";
import { countries } from "@/lib/countries";

/** GST state codes (first two digits of a GSTIN). 97 = Other Territory. */
export const INDIAN_STATES = [
  { code: "01", name: "Jammu and Kashmir" },
  { code: "02", name: "Himachal Pradesh" },
  { code: "03", name: "Punjab" },
  { code: "04", name: "Chandigarh" },
  { code: "05", name: "Uttarakhand" },
  { code: "06", name: "Haryana" },
  { code: "07", name: "Delhi" },
  { code: "08", name: "Rajasthan" },
  { code: "09", name: "Uttar Pradesh" },
  { code: "10", name: "Bihar" },
  { code: "11", name: "Sikkim" },
  { code: "12", name: "Arunachal Pradesh" },
  { code: "13", name: "Nagaland" },
  { code: "14", name: "Manipur" },
  { code: "15", name: "Mizoram" },
  { code: "16", name: "Tripura" },
  { code: "17", name: "Meghalaya" },
  { code: "18", name: "Assam" },
  { code: "19", name: "West Bengal" },
  { code: "20", name: "Jharkhand" },
  { code: "21", name: "Odisha" },
  { code: "22", name: "Chhattisgarh" },
  { code: "23", name: "Madhya Pradesh" },
  { code: "24", name: "Gujarat" },
  { code: "26", name: "Dadra and Nagar Haveli and Daman and Diu" },
  { code: "27", name: "Maharashtra" },
  { code: "29", name: "Karnataka" },
  { code: "30", name: "Goa" },
  { code: "31", name: "Lakshadweep" },
  { code: "32", name: "Kerala" },
  { code: "33", name: "Tamil Nadu" },
  { code: "34", name: "Puducherry" },
  { code: "35", name: "Andaman and Nicobar Islands" },
  { code: "36", name: "Telangana" },
  { code: "37", name: "Andhra Pradesh" },
  { code: "38", name: "Ladakh" },
  { code: "97", name: "Other Territory" },
] as const;
export type IndianState = (typeof INDIAN_STATES)[number];

export const stateByCode = (code: string | null | undefined) => INDIAN_STATES.find((s) => s.code === code) ?? null;

/** Standard GST rates, offered as suggestions. Any rate from 0 to 100 is accepted. */
export const GST_RATES = ["0", "0.25", "3", "5", "12", "18", "28", "40"] as const;

export const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const PAN_RE = /^[A-Z]{5}\d{4}[A-Z]$/;
export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
/** HSN: 4, 6 or 8 digits. SAC: 6 digits starting 99. */
export const HSN_RE = /^(\d{4}|\d{6}|\d{8})$/;
export const SAC_RE = /^99\d{4}$/;
const COUNTRY_CODES = new Set(countries.map((c) => c.code));

/** Largest amount accepted anywhere: Rs 1,000 crore, in paise. */
export const MAX_PAISE = 10_000_000_000_00;

/** Paise as a rupee string for inputs: 123456 → "1234.56", 100 → "1.00". */
export function paiseToRupees(paise: number | null | undefined): string {
  if (paise === null || paise === undefined) return "";
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(paise);
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

const inrFormat = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" });
/** Paise for display: 123456 → "₹1,234.56". */
export const formatPaise = (paise: number) => inrFormat.format(paise / 100);

export type FieldErrors = Record<string, string>;

/**
 * Reads raw input (form state or a JSON body) field by field, collecting
 * one message per bad field. Empty optional fields come back as null.
 */
export class FieldReader {
  readonly errors: FieldErrors = {};

  constructor(private readonly raw: Record<string, unknown>) {}

  get ok() {
    return Object.keys(this.errors).length === 0;
  }

  fail(key: string, message: string) {
    this.errors[key] ??= message;
  }

  has(key: string) {
    return key in this.errors;
  }

  value(key: string): unknown {
    return this.raw[key];
  }

  /** Trimmed text or null. `required` gives the message when it's missing. */
  text(key: string, max: number, required?: string): string | null {
    const v = this.raw[key];
    if (v === undefined || v === null) {
      if (required) this.fail(key, required);
      return null;
    }
    if (typeof v !== "string") {
      this.fail(key, "Enter text here.");
      return null;
    }
    const t = v.trim();
    if (t.length > max) {
      this.fail(key, `Keep this under ${max + 1} characters.`);
      return null;
    }
    if (!t && required) this.fail(key, required);
    return t || null;
  }

  /** Upper-cased text matching `re`, or null when blank. */
  code(key: string, re: RegExp, message: string, max = 20): string | null {
    const t = this.text(key, max);
    if (!t) return null;
    const up = t.toUpperCase().replace(/\s+/g, "");
    if (!re.test(up)) {
      this.fail(key, message);
      return null;
    }
    return up;
  }

  gstin(key = "gstin") {
    return this.code(key, GSTIN_RE, "Enter a valid 15-character GSTIN, e.g. 27ABCDE1234F1Z5.", 15);
  }

  pan(key = "pan") {
    return this.code(key, PAN_RE, "Enter a valid 10-character PAN, e.g. ABCDE1234F.", 10);
  }

  /** PAN must match characters 3–12 of the GSTIN when both are given. */
  panMatchesGstin(gstin: string | null, pan: string | null, key = "pan") {
    if (gstin && pan && gstin.slice(2, 12) !== pan) this.fail(key, "This PAN doesn't match the one inside the GSTIN.");
  }

  email(key = "email") {
    const t = this.text(key, 254);
    if (t && !isEmail(t)) {
      this.fail(key, "Enter a valid email address.");
      return null;
    }
    return t ? t.toLowerCase() : null;
  }

  phone(key = "phone") {
    const t = this.text(key, 30);
    if (t && !/^\+?[\d\s()-]{6,30}$/.test(t)) {
      this.fail(key, "Enter a valid contact number.");
      return null;
    }
    return t;
  }

  /** Whole number in [min, max], or null when blank and not required. */
  int(key: string, min: number, max: number, message: string, required = false): number | null {
    const v = this.raw[key];
    if (v === undefined || v === null || v === "") {
      if (required) this.fail(key, message);
      return null;
    }
    const n = typeof v === "number" ? v : typeof v === "string" && /^-?\d+$/.test(v.trim()) ? Number(v) : NaN;
    if (!Number.isInteger(n) || n < min || n > max) {
      this.fail(key, message);
      return null;
    }
    return n;
  }

  /**
   * A rupee amount ("1,234.50" or 1234.5) as whole paise, without floating
   * point rounding. Blank → null (or the `required` message).
   */
  rupees(key: string, opts: { required?: string; allowNegative?: boolean } = {}): number | null {
    const v = this.raw[key];
    if (v === undefined || v === null || v === "") {
      if (opts.required) this.fail(key, opts.required);
      return null;
    }
    const s = (typeof v === "number" ? v.toFixed(2) : typeof v === "string" ? v : "").replace(/[,\s₹]/g, "");
    const m = /^(-)?(\d{1,13})(?:\.(\d{1,2}))?$/.exec(s);
    if (!m || (m[1] && !opts.allowNegative)) {
      this.fail(key, opts.allowNegative ? "Enter an amount, e.g. 1500 or -250.50." : "Enter an amount, e.g. 1500 or 1500.50.");
      return null;
    }
    const paise = Number(m[2]) * 100 + Number((m[3] ?? "").padEnd(2, "0"));
    if (paise > MAX_PAISE) {
      this.fail(key, "That amount is too large.");
      return null;
    }
    return m[1] && paise !== 0 ? -paise : paise;
  }

  /** A decimal in [0, max] with up to `scale` decimals, as a normalised string. */
  decimal(key: string, scale: number, max: number, message: string, required = false): string | null {
    const v = this.raw[key];
    if (v === undefined || v === null || v === "") {
      if (required) this.fail(key, message);
      return null;
    }
    const s = typeof v === "number" ? String(v) : typeof v === "string" ? v.trim() : "";
    const m = new RegExp(`^\\d{1,12}(\\.\\d{1,${scale}})?$`).exec(s);
    if (!m || Number(s) > max) {
      this.fail(key, message);
      return null;
    }
    // "18.00" → "18", "0.250" → "0.25"
    return s.includes(".") ? s.replace(/\.?0+$/, "") : String(Number(s));
  }

  /** GST rate: 0–100, up to 4 decimals. Defaults to 0 when blank. */
  taxRate(key = "taxRate"): string {
    return this.decimal(key, 4, 100, "Enter a tax rate from 0 to 100, e.g. 18.") ?? "0";
  }

  bool(key: string, fallback = false): boolean {
    const v = this.raw[key];
    if (v === undefined || v === null) return fallback;
    if (typeof v !== "boolean") {
      this.fail(key, "Choose yes or no.");
      return fallback;
    }
    return v;
  }

  oneOf<T extends string>(key: string, values: readonly T[], message: string, fallback?: T): T {
    const v = this.raw[key] ?? fallback;
    if (typeof v !== "string" || !values.includes(v as T)) {
      this.fail(key, message);
      return (fallback ?? values[0]) as T;
    }
    return v as T;
  }

  /** An id string (or null). Existence is checked by the service. */
  id(key: string, required?: string): string | null {
    const v = this.raw[key];
    if (v === undefined || v === null || v === "") {
      if (required) this.fail(key, required);
      return null;
    }
    if (typeof v !== "string" || v.length > 64) {
      this.fail(key, "Choose an option from the list.");
      return null;
    }
    return v;
  }

  country(key = "countryCode"): string {
    const v = typeof this.raw[key] === "string" ? (this.raw[key] as string).toUpperCase() : "IN";
    if (!COUNTRY_CODES.has(v)) this.fail(key, "Choose a country.");
    return v;
  }
}

export type AddressValues = {
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  /** State name. In India it comes from stateCode. */
  state: string | null;
  /** GST state code; India only. */
  stateCode: string | null;
  postalCode: string | null;
  countryCode: string;
};

export const EMPTY_ADDRESS: AddressValues = {
  addressLine1: null,
  addressLine2: null,
  city: null,
  state: null,
  stateCode: null,
  postalCode: null,
  countryCode: "IN",
};

/**
 * Reads an address object. Errors are reported as `${prefix}.field`, e.g.
 * "billingAddress.postalCode". In India the state is chosen by GST code.
 */
export function readAddress(raw: unknown, prefix: string, errors: FieldErrors): AddressValues {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const r = new FieldReader(obj);
  const countryCode = r.country("countryCode");
  const addressLine1 = r.text("addressLine1", 200);
  const addressLine2 = r.text("addressLine2", 200);
  const city = r.text("city", 100);
  let state = r.text("state", 100);
  let stateCode = r.text("stateCode", 2);
  let postalCode = r.text("postalCode", 12);

  if (countryCode === "IN") {
    const found = stateByCode(stateCode);
    if (stateCode && !found) r.fail("stateCode", "Choose a state.");
    state = found?.name ?? null;
    stateCode = found?.code ?? null;
    if (postalCode && !/^\d{6}$/.test(postalCode)) r.fail("postalCode", "Enter a 6-digit PIN code.");
  } else {
    stateCode = null;
    if (postalCode && !/^[A-Za-z0-9 -]{2,12}$/.test(postalCode)) r.fail("postalCode", "Enter a valid postal code.");
    postalCode = postalCode?.toUpperCase() ?? null;
  }

  for (const [k, msg] of Object.entries(r.errors)) errors[`${prefix}.${k}`] ??= msg;
  return { addressLine1, addressLine2, city, state, stateCode, postalCode, countryCode };
}

export const isBlankAddress = (a: AddressValues) =>
  !a.addressLine1 && !a.addressLine2 && !a.city && !a.state && !a.stateCode && !a.postalCode;
