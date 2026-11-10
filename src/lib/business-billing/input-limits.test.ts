import { describe, expect, it } from "vitest";

import {
  cleanBankAccount,
  cleanGstin,
  cleanIfsc,
  cleanInvoicePrefix,
  cleanPan,
  cleanPostalCode,
} from "./input-limits";

describe("input limits", () => {
  it("keeps tax ids to their length, upper case, letters and digits only", () => {
    expect(cleanGstin("27abcde-1234 f1z5XYZ")).toBe("27ABCDE1234F1Z5");
    expect(cleanPan("abcde 1234 fGHIJ")).toBe("ABCDE1234F");
    expect(cleanIfsc("hdfc-0001234-99")).toBe("HDFC0001234");
  });

  it("keeps an Indian PIN to 6 digits, even from a messy paste", () => {
    expect(cleanPostalCode("PIN: 201-001 (UP)", "IN")).toBe("201001");
    expect(cleanPostalCode("20100199", "IN")).toBe("201001");
  });

  it("allows letters and spaces in postal codes outside India, up to 12", () => {
    expect(cleanPostalCode("SW1A 1AA!", "GB")).toBe("SW1A 1AA");
    expect(cleanPostalCode("1234567890ABCD", "US")).toBe("1234567890AB");
  });

  it("keeps bank account numbers to 18 digits and prefixes to 10 allowed characters", () => {
    expect(cleanBankAccount("1234 5678 9012 3456 7890")).toBe("123456789012345678");
    expect(cleanInvoicePrefix("IN V#2026/ABCDEF")).toBe("INV2026/AB");
  });
});
