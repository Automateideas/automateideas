// Company billing settings: one set of rules for the form and the API.
// Pure (no server imports), so the browser can use it too.

import { isEmail } from "@/app/(auth)/_lib/validate";
import { countries } from "@/lib/countries";

export const BILLING_CURRENCIES = ["INR"] as const;

export type BillingSettingsValues = {
  legalName: string;
  tradeName: string | null;
  gstin: string | null;
  pan: string | null;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  countryCode: string;
  currency: (typeof BILLING_CURRENCIES)[number];
  financialYearStartMonth: number;
  invoicePrefix: string;
};

export type BillingSettingsErrors = Partial<Record<keyof BillingSettingsValues, string>>;

export const DEFAULT_BILLING_SETTINGS: Omit<BillingSettingsValues, "legalName"> = {
  tradeName: null,
  gstin: null,
  pan: null,
  email: null,
  phone: null,
  addressLine1: null,
  addressLine2: null,
  city: null,
  state: null,
  postalCode: null,
  countryCode: "IN",
  currency: "INR",
  financialYearStartMonth: 4,
  invoicePrefix: "INV-",
};

// 2-digit state code, 10-character PAN, entity number, "Z", check character.
const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const PAN_RE = /^[A-Z]{5}\d{4}[A-Z]$/;
const PREFIX_RE = /^[A-Za-z0-9/_-]{1,10}$/;
const COUNTRY_CODES = new Set(countries.map((c) => c.code));

/** Trimmed string, or null when empty or not a string. */
function text(value: unknown, max: number): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined; // wrong type: reported as an error
  const t = value.trim();
  if (t.length > max) return undefined;
  return t || null;
}

/**
 * Checks raw input (form state or a JSON body) and returns cleaned values, or
 * field errors. GSTIN and PAN are upper-cased; empty optional fields become null.
 */
export function validateBillingSettings(raw: Record<string, unknown>):
  | { ok: true; values: BillingSettingsValues }
  | { ok: false; errors: BillingSettingsErrors } {
  const errors: BillingSettingsErrors = {};
  const tooLong = "This is too long.";

  const legalName = text(raw.legalName, 200);
  if (legalName === undefined) errors.legalName = tooLong;
  else if (!legalName) errors.legalName = "Enter your registered business name.";

  const tradeName = text(raw.tradeName, 200);
  if (tradeName === undefined) errors.tradeName = tooLong;

  const gstinRaw = text(raw.gstin, 15);
  const gstin = gstinRaw ? gstinRaw.toUpperCase() : gstinRaw;
  if (gstin === undefined || (gstin && !GSTIN_RE.test(gstin))) {
    errors.gstin = "Enter a valid 15-character GSTIN, e.g. 27ABCDE1234F1Z5.";
  }

  const panRaw = text(raw.pan, 10);
  const pan = panRaw ? panRaw.toUpperCase() : panRaw;
  if (pan === undefined || (pan && !PAN_RE.test(pan))) {
    errors.pan = "Enter a valid 10-character PAN, e.g. ABCDE1234F.";
  }
  // A GSTIN contains the business's PAN in characters 3–12.
  if (gstin && pan && !errors.gstin && !errors.pan && gstin.slice(2, 12) !== pan) {
    errors.pan = "This PAN doesn't match the one inside your GSTIN.";
  }

  const email = text(raw.email, 254);
  if (email === undefined || (email && !isEmail(email))) errors.email = "Enter a valid email address.";

  const phone = text(raw.phone, 30);
  if (phone === undefined) errors.phone = "Enter a valid contact number.";

  const addressLine1 = text(raw.addressLine1, 200);
  const addressLine2 = text(raw.addressLine2, 200);
  const city = text(raw.city, 100);
  const state = text(raw.state, 100);
  const postalCode = text(raw.postalCode, 12);
  if (addressLine1 === undefined) errors.addressLine1 = tooLong;
  if (addressLine2 === undefined) errors.addressLine2 = tooLong;
  if (city === undefined) errors.city = tooLong;
  if (state === undefined) errors.state = tooLong;
  if (postalCode === undefined) errors.postalCode = "Enter a valid postal code.";

  const countryCode = typeof raw.countryCode === "string" ? raw.countryCode.toUpperCase() : "";
  if (!COUNTRY_CODES.has(countryCode)) errors.countryCode = "Choose a country.";
  if (gstin && countryCode !== "IN") errors.gstin = "GSTIN applies only to businesses in India.";

  const currency = raw.currency ?? DEFAULT_BILLING_SETTINGS.currency;
  if (!BILLING_CURRENCIES.includes(currency as BillingSettingsValues["currency"])) {
    errors.currency = "Only INR is supported for now.";
  }

  const month = raw.financialYearStartMonth;
  if (typeof month !== "number" || !Number.isInteger(month) || month < 1 || month > 12) {
    errors.financialYearStartMonth = "Choose the month your financial year starts.";
  }

  const invoicePrefix = typeof raw.invoicePrefix === "string" ? raw.invoicePrefix.trim() : "";
  if (!PREFIX_RE.test(invoicePrefix)) {
    errors.invoicePrefix = "Use 1–10 letters, numbers, dashes, slashes or underscores.";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    values: {
      legalName: legalName!,
      tradeName: tradeName ?? null,
      gstin: gstin ?? null,
      pan: pan ?? null,
      email: email ?? null,
      phone: phone ?? null,
      addressLine1: addressLine1 ?? null,
      addressLine2: addressLine2 ?? null,
      city: city ?? null,
      state: state ?? null,
      postalCode: postalCode ?? null,
      countryCode,
      currency: currency as BillingSettingsValues["currency"],
      financialYearStartMonth: month as number,
      invoicePrefix,
    },
  };
}
