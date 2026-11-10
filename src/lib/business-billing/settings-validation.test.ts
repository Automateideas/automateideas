import { describe, expect, it } from "vitest";

import { validateBillingSettings } from "./settings-validation";

const valid = {
  legalName: "Automate Ideas",
  tradeName: "",
  gstin: "27abcde1234f1z5",
  pan: "abcde1234f",
  email: "automation@automateideas.com",
  phone: "+91 9625598603",
  addressLine1: "H12 Adarsh Nagar Ghaziabad",
  addressLine2: "",
  city: "Ghaziabad",
  state: "Uttar Pradesh",
  postalCode: "201001",
  countryCode: "in",
  currency: "INR",
  financialYearStartMonth: 4,
  invoicePrefix: "INV-",
};

describe("validateBillingSettings", () => {
  it("cleans valid input: trims, upper-cases tax ids, blanks become null", () => {
    const r = validateBillingSettings(valid);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.values).toMatchObject({
      legalName: "Automate Ideas",
      tradeName: null,
      gstin: "27ABCDE1234F1Z5",
      pan: "ABCDE1234F",
      addressLine2: null,
      countryCode: "IN",
    });
  });

  it("needs only the business name, country, month and prefix", () => {
    const r = validateBillingSettings({
      legalName: "Solo Studio",
      countryCode: "IN",
      financialYearStartMonth: 4,
      invoicePrefix: "SS/",
    });
    expect(r.ok).toBe(true);
  });

  it("requires a business name", () => {
    const r = validateBillingSettings({ ...valid, legalName: "   " });
    expect(r.ok === false && r.errors.legalName).toBeTruthy();
  });

  it("rejects a malformed GSTIN or PAN", () => {
    const r = validateBillingSettings({
      ...valid,
      gstin: "27ABCDE1234F1X5",
      pan: "ABCD1234F",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.gstin).toMatch(/GSTIN/);
    expect(r.errors.pan).toMatch(/PAN/);
  });

  it("flags a PAN that differs from the one inside the GSTIN", () => {
    const r = validateBillingSettings({ ...valid, pan: "ZZZZZ9999Z" });
    expect(r.ok === false && r.errors.pan).toMatch(/doesn't match/);
  });

  it("allows GSTIN only for India", () => {
    const r = validateBillingSettings({ ...valid, countryCode: "US", pan: "" });
    expect(r.ok === false && r.errors.gstin).toMatch(/India/);
  });

  it("rejects bad email, country, month, prefix and currency", () => {
    const r = validateBillingSettings({
      ...valid,
      email: "nope",
      countryCode: "XX",
      financialYearStartMonth: 13,
      invoicePrefix: "TOO LONG PREFIX",
      currency: "USD",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errors).sort()).toEqual(
      [
        "countryCode",
        "currency",
        "email",
        "financialYearStartMonth",
        "invoicePrefix",
        "gstin",
      ].sort(),
    );
  });

  it("rejects wrong types instead of crashing", () => {
    const r = validateBillingSettings({
      ...valid,
      legalName: 42,
      city: ["x"],
      financialYearStartMonth: "4",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.legalName).toBeTruthy();
    expect(r.errors.city).toBeTruthy();
    expect(r.errors.financialYearStartMonth).toBeTruthy();
  });
});
