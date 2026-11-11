// Customers and suppliers: one set of rules for the forms and the APIs. Pure.

import {
  type AddressValues,
  type FieldErrors,
  FieldReader,
  IFSC_RE,
  isBlankAddress,
  readAddress,
  stateByCode,
} from "./fields";

export const CUSTOMER_TYPES = ["business", "individual"] as const;
export type CustomerType = (typeof CUSTOMER_TYPES)[number];

export type CustomerValues = {
  customerType: CustomerType;
  name: string;
  displayName: string | null;
  contactPerson: string | null;
  code: string | null;
  category: string | null;
  gstin: string | null;
  pan: string | null;
  email: string | null;
  phone: string | null;
  /** GST state code of the place of supply; from the GSTIN, else the billing state (India only). */
  placeOfSupply: string | null;
  paymentTermsDays: number | null;
  creditLimitPaise: number | null;
  openingBalancePaise: number;
  priceListId: string | null;
  notes: string | null;
  /** Automatic payment reminders (when the company has them on). */
  sendReminders: boolean;
  billingAddress: AddressValues;
  /** null = same as billing. */
  shippingAddress: AddressValues | null;
};

type Result<T> = { ok: true; values: T } | { ok: false; errors: FieldErrors };

const NAME_REQUIRED = "Enter the customer's name.";

/**
 * Checks a customer. Amounts arrive in rupees (creditLimit, openingBalance)
 * and come back in paise. GSTIN and PAN are upper-cased and cross-checked.
 */
export function validateCustomer(raw: Record<string, unknown>): Result<CustomerValues> {
  const r = new FieldReader(raw);
  const customerType = r.oneOf("customerType", CUSTOMER_TYPES, "Choose business or individual.", "business");
  const name = r.text("name", 200, NAME_REQUIRED);
  const displayName = r.text("displayName", 200);
  const contactPerson = r.text("contactPerson", 200);
  const code = r.text("code", 30);
  const category = r.text("category", 60);
  const gstin = r.gstin();
  const pan = r.pan();
  r.panMatchesGstin(gstin, pan);
  const email = r.email();
  const phone = r.phone();
  const paymentTermsDays = r.int("paymentTermsDays", 0, 365, "Enter 0 to 365 days.");
  const creditLimitPaise = r.rupees("creditLimit");
  const openingBalancePaise = r.rupees("openingBalance", { allowNegative: true }) ?? 0;
  const priceListId = r.id("priceListId");
  const notes = r.text("notes", 2000);

  const errors = r.errors;
  const billingAddress = readAddress(raw.billingAddress, "billingAddress", errors);
  const shippingAddress =
    raw.shippingAddress === null || raw.shippingAddress === undefined
      ? null
      : readAddress(raw.shippingAddress, "shippingAddress", errors);

  // GST registration ties the customer to India and to the GSTIN's state.
  let placeOfSupply: string | null = null;
  if (gstin) {
    const state = stateByCode(gstin.slice(0, 2));
    if (!state) errors.gstin ??= "The first two digits of this GSTIN aren't a valid state code.";
    if (billingAddress.countryCode !== "IN") errors["billingAddress.countryCode"] ??= "A GSTIN means the customer is in India.";
    else if (billingAddress.stateCode && state && billingAddress.stateCode !== state.code) {
      errors["billingAddress.stateCode"] ??= `This GSTIN is registered in ${state.name}.`;
    }
    placeOfSupply = state?.code ?? null;
  } else if (billingAddress.countryCode === "IN") {
    placeOfSupply = billingAddress.stateCode;
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    values: {
      customerType,
      name: name!,
      displayName,
      contactPerson,
      code,
      category,
      gstin,
      pan,
      email,
      phone,
      placeOfSupply,
      paymentTermsDays,
      creditLimitPaise,
      openingBalancePaise,
      priceListId,
      notes,
      sendReminders: r.bool("sendReminders", true),
      billingAddress,
      shippingAddress: shippingAddress && !isBlankAddress(shippingAddress) ? shippingAddress : null,
    },
  };
}

export type SupplierValues = AddressValues & {
  name: string;
  displayName: string | null;
  contactPerson: string | null;
  code: string | null;
  gstin: string | null;
  pan: string | null;
  email: string | null;
  phone: string | null;
  paymentTermsDays: number | null;
  openingBalancePaise: number;
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  notes: string | null;
};

/** Checks a supplier. The address fields sit at the top level, as in the table. */
export function validateSupplier(raw: Record<string, unknown>): Result<SupplierValues> {
  const r = new FieldReader(raw);
  const name = r.text("name", 200, "Enter the supplier's name.");
  const displayName = r.text("displayName", 200);
  const contactPerson = r.text("contactPerson", 200);
  const code = r.text("code", 30);
  const gstin = r.gstin();
  const pan = r.pan();
  r.panMatchesGstin(gstin, pan);
  const email = r.email();
  const phone = r.phone();
  const paymentTermsDays = r.int("paymentTermsDays", 0, 365, "Enter 0 to 365 days.");
  const openingBalancePaise = r.rupees("openingBalance", { allowNegative: true }) ?? 0;
  const bankName = r.text("bankName", 100);
  const bankAccountName = r.text("bankAccountName", 200);
  const bankAccountNumber = r.code("bankAccountNumber", /^\d{6,18}$/, "Enter a 6 to 18 digit account number.", 18);
  const bankIfsc = r.code("bankIfsc", IFSC_RE, "Enter a valid 11-character IFSC, e.g. HDFC0001234.", 11);
  const notes = r.text("notes", 2000);

  const errors = r.errors;
  const address = readAddress(raw, "address", errors);
  // Report address problems under their plain names (the form is flat).
  for (const key of Object.keys(errors)) {
    if (key.startsWith("address.")) {
      errors[key.slice(8)] ??= errors[key];
      delete errors[key];
    }
  }

  if (gstin) {
    const state = stateByCode(gstin.slice(0, 2));
    if (!state) errors.gstin ??= "The first two digits of this GSTIN aren't a valid state code.";
    if (address.countryCode !== "IN") errors.countryCode ??= "A GSTIN means the supplier is in India.";
    else if (address.stateCode && state && address.stateCode !== state.code) {
      errors.stateCode ??= `This GSTIN is registered in ${state.name}.`;
    }
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    values: {
      name: name!,
      displayName,
      contactPerson,
      code,
      gstin,
      pan,
      email,
      phone,
      paymentTermsDays,
      openingBalancePaise,
      bankName,
      bankAccountName,
      bankAccountNumber,
      bankIfsc,
      notes,
      ...address,
    },
  };
}
