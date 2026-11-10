// Tax settings rules, shared by the form and the API. Pure.

import { type FieldErrors, FieldReader, stateByCode } from "./fields";
import { NUMBERED_DOCUMENTS, type NumberingSettings, validateNumberFormat } from "./numbering-format";

export const ROUND_OFF_MODES = ["nearest_rupee", "none"] as const;
export type RoundOffMode = (typeof ROUND_OFF_MODES)[number];

export type TaxSettingsValues = { stateCode: string | null; pricesIncludeTax: boolean; roundOff: RoundOffMode };

/**
 * `gstin` is the company's saved GSTIN. When registered, the business state
 * is the GSTIN's state; otherwise it's optional (needed only to decide
 * CGST+SGST vs IGST, which unregistered businesses don't charge).
 */
export function validateTaxSettings(raw: Record<string, unknown>, gstin: string | null):
  | { ok: true; values: TaxSettingsValues }
  | { ok: false; errors: FieldErrors } {
  const r = new FieldReader(raw);
  let stateCode = r.text("stateCode", 2);
  if (stateCode && !stateByCode(stateCode)) r.fail("stateCode", "Choose a state.");
  if (gstin) {
    const fromGstin = gstin.slice(0, 2);
    if (stateCode && stateCode !== fromGstin) r.fail("stateCode", `Your GSTIN is registered in ${stateByCode(fromGstin)?.name ?? fromGstin}.`);
    stateCode = fromGstin;
  }
  const pricesIncludeTax = r.bool("pricesIncludeTax");
  const roundOff = r.oneOf("roundOff", ROUND_OFF_MODES, "Choose how totals are rounded.", "nearest_rupee");
  return r.ok ? { ok: true, values: { stateCode, pricesIncludeTax, roundOff } } : { ok: false, errors: r.errors };
}

/** All document formats; errors come back as "invoice.prefix" etc. */
export function validateNumbering(raw: unknown): { ok: true; values: NumberingSettings } | { ok: false; errors: FieldErrors } {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const errors: FieldErrors = {};
  const values = {} as NumberingSettings;
  for (const d of NUMBERED_DOCUMENTS) {
    const res = validateNumberFormat(obj[d.type]);
    if (res.ok) values[d.type] = res.values;
    else for (const [k, v] of Object.entries(res.errors)) errors[`${d.type}.${k}`] = v;
  }
  // Two document types sharing a prefix and year format would print look-alike numbers.
  const seen = new Map<string, string>();
  for (const d of NUMBERED_DOCUMENTS) {
    const v = values[d.type];
    if (!v) continue;
    const key = `${v.prefix.toUpperCase().replace(/[-/]+$/, "")}|${v.includeFinancialYear}`;
    const other = seen.get(key);
    if (other) errors[`${d.type}.prefix`] ??= `Same prefix as ${other}. Use a different one so numbers can't be confused.`;
    else seen.set(key, d.label);
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, values };
}
