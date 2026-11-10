/**
 * What business-billing fields let through as they are typed or pasted, so a
 * value can't run past its real length or pick up stray characters. Used by
 * the company settings, customer and supplier forms. The API still validates
 * the result (lib/business-billing/settings-validation.ts, fields.ts).
 *
 * Fields cleaned here get no HTML maxLength: the browser would cut a paste such
 * as "PIN: 201001" to its first characters before the stray ones are removed.
 */

const keep = (value: string, disallowed: RegExp, max: number) => value.replace(disallowed, "").slice(0, max);

/** 15 characters, letters and digits, upper case: "27ABCDE1234F1Z5". */
export const cleanGstin = (v: string) => keep(v.toUpperCase(), /[^A-Z0-9]/g, 15);

/** 10 characters, letters and digits, upper case: "ABCDE1234F". */
export const cleanPan = (v: string) => keep(v.toUpperCase(), /[^A-Z0-9]/g, 10);

/** 11 characters, letters and digits, upper case: "HDFC0001234". */
export const cleanIfsc = (v: string) => keep(v.toUpperCase(), /[^A-Z0-9]/g, 11);

/** 6 to 18 digits. */
export const cleanBankAccount = (v: string) => keep(v, /\D/g, 18);

/** India: a 6-digit PIN. Elsewhere: up to 12 letters, digits, spaces or dashes. */
export const cleanPostalCode = (v: string, countryCode: string | null | undefined) =>
  countryCode === "IN" ? keep(v, /\D/g, 6) : keep(v, /[^A-Za-z0-9 -]/g, 12);

/** Up to 10 letters, digits, dashes, slashes or underscores: "INV-", "ACME/". */
export const cleanInvoicePrefix = (v: string) => keep(v, /[^A-Za-z0-9/_-]/g, 10);
