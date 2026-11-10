import { describe, expect, it } from "vitest";

import {
  MAX_NUMBER_LENGTH,
  NUMBERED_DOCUMENTS,
  defaultNumbering,
  financialYearOf,
  formatDocumentNumber,
  indiaDate,
  numberingFrom,
  validateNumberFormat,
} from "./numbering-format";
import { parseTaxRequest } from "./tax/request";
import { validateNumbering, validateTaxSettings } from "./tax-settings-validation";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe("financial years", () => {
  it.each([
    ["2026-11-10", 4, "2026-27"],
    ["2027-02-15", 4, "2026-27"],
    ["2027-03-31", 4, "2026-27"],
    ["2027-04-01", 4, "2027-28"],
    ["2099-12-31", 4, "2099-00"],
    ["2026-06-30", 1, "2026"],
    ["2026-06-30", 7, "2025-26"],
    ["2026-07-01", 7, "2026-27"],
  ])("%s with start month %i → %s", (date, start, fy) => {
    expect(financialYearOf(d(date), start)).toBe(fy);
  });

  it("dates documents in India time", () => {
    // 31 March 2027, 20:00 UTC = 1 April 01:30 IST: the new financial year.
    expect(indiaDate(new Date("2027-03-31T20:00:00Z")).toISOString().slice(0, 10)).toBe("2027-04-01");
    expect(indiaDate(new Date("2027-03-31T18:00:00Z")).toISOString().slice(0, 10)).toBe("2027-03-31");
  });
});

describe("number formats", () => {
  it("formats like ABC/2026-27/0001", () => {
    expect(formatDocumentNumber({ prefix: "ABC", includeFinancialYear: true, padding: 3 }, "2026-27", 1)).toBe("ABC/2026-27/001");
    expect(formatDocumentNumber({ prefix: "INV-", includeFinancialYear: true, padding: 4 }, "2026-27", 12)).toBe("INV-2026-27-0012");
    expect(formatDocumentNumber({ prefix: "ABC/", includeFinancialYear: false, padding: 2 }, "2026-27", 123)).toBe("ABC/123");
  });

  it("defaults fit GST's 16 characters and keep the old invoice prefix", () => {
    for (const doc of NUMBERED_DOCUMENTS) {
      const f = defaultNumbering()[doc.type];
      expect(formatDocumentNumber(f, "2026-27", 1).length, doc.type).toBeLessThanOrEqual(MAX_NUMBER_LENGTH);
    }
    expect(defaultNumbering("ACME/").invoice.prefix).toBe("ACME");
    expect(defaultNumbering("A_B-").invoice.prefix).toBe("AB");
  });

  it("validates prefix characters, digits and total length", () => {
    expect(validateNumberFormat({ prefix: "ABC", includeFinancialYear: true, padding: 3 }).ok).toBe(true);
    expect(validateNumberFormat({ prefix: "A_B", includeFinancialYear: true, padding: 3 }).ok).toBe(false);
    expect(validateNumberFormat({ prefix: "ABC", padding: 9 }).ok).toBe(false);
    const long = validateNumberFormat({ prefix: "LONGPREFIX", includeFinancialYear: true, padding: 4 });
    expect(!long.ok && long.errors.prefix).toMatch(/16/);
  });

  it("merges stored formats over defaults, ignoring bad entries", () => {
    const n = numberingFrom({ invoice: { prefix: "XY", includeFinancialYear: false, padding: 5 }, quotation: { prefix: "bad prefix!" } });
    expect(n.invoice).toEqual({ prefix: "XY", includeFinancialYear: false, padding: 5 });
    expect(n.quotation.prefix).toBe("QT");
  });

  it("refuses two document types with the same prefix", () => {
    const formats = { ...defaultNumbering(), quotation: { prefix: "INV", includeFinancialYear: true, padding: 4 } };
    const r = validateNumbering(formats);
    expect(!r.ok && r.errors["quotation.prefix"]).toMatch(/Same prefix/);
    expect(validateNumbering(defaultNumbering()).ok).toBe(true);
  });
});

describe("tax settings", () => {
  it("takes the state from the GSTIN when registered", () => {
    expect(validateTaxSettings({ roundOff: "none" }, "27ABCDE1234F1Z5")).toEqual({ ok: true, values: { stateCode: "27", pricesIncludeTax: false, roundOff: "none" } });
    const clash = validateTaxSettings({ stateCode: "29" }, "27ABCDE1234F1Z5");
    expect(!clash.ok && clash.errors.stateCode).toMatch(/Maharashtra/);
  });

  it("lets unregistered businesses pick a state or none", () => {
    expect(validateTaxSettings({ stateCode: "29", pricesIncludeTax: true }, null)).toMatchObject({ ok: true, values: { stateCode: "29", pricesIncludeTax: true } });
    expect(validateTaxSettings({ stateCode: "55" }, null).ok).toBe(false);
    expect(validateTaxSettings({ roundOff: "up" }, null).ok).toBe(false);
  });
});

describe("tax requests", () => {
  const opts = { sellerStateCode: "27", sellerRegistered: true, roundOff: "nearest_rupee" as const, defaultPricesIncludeTax: false };

  it("turns rupees into paise and fills seller details", () => {
    const r = parseTaxRequest(
      {
        placeOfSupply: "29",
        lines: [{ quantity: "2", rate: "1,250.50", taxRate: "18", discount: { type: "percent", value: "10" } }],
        charges: [{ label: "Shipping", amount: "100", taxRate: "18" }],
        invoiceDiscount: { type: "amount", value: "50" },
      },
      opts,
    );
    expect(r.ok && r.input).toMatchObject({
      sellerStateCode: "27",
      placeOfSupply: "29",
      pricesIncludeTax: false,
      roundOff: "nearest_rupee",
      invoiceDiscount: { type: "amount", paise: 5000 },
      lines: [{ quantity: "2", ratePaise: 125050, taxRate: "18", taxCategory: "taxable", discount: { type: "percent", percent: "10" } }],
      charges: [{ label: "Shipping", amountPaise: 10000 }],
    });
  });

  it("requires the place of supply for registered sellers (no silent export)", () => {
    const r = parseTaxRequest({ lines: [{ quantity: "1", rate: "10" }] }, opts);
    expect(!r.ok && r.errors.placeOfSupply).toBeTruthy();
    expect(parseTaxRequest({ placeOfSupply: "96", lines: [{ quantity: "1", rate: "10" }] }, opts).ok).toBe(true);
    expect(parseTaxRequest({ lines: [{ quantity: "1", rate: "10" }] }, { ...opts, sellerRegistered: false }).ok).toBe(true);
  });

  it("reports line problems by position", () => {
    const r = parseTaxRequest({ placeOfSupply: "27", lines: [{ quantity: "1", rate: "10" }, { quantity: "x", rate: "", taxCategory: "odd", discount: { type: "percent", value: "120" } }] }, opts);
    expect(!r.ok && Object.keys(r.errors).sort()).toEqual(["lines.1.discount.value", "lines.1.quantity", "lines.1.rate", "lines.1.taxCategory"]);
    expect(parseTaxRequest({ placeOfSupply: "27", lines: [] }, opts).ok).toBe(false);
  });
});
