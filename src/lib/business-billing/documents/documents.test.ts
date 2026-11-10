import { describe, expect, it } from "vitest";

import { DOCUMENT_SLUGS, DOCUMENT_TYPES, amountInWords, displayStatus, todayInIndia } from "./types";
import { validateDocument } from "./validation";

const base = {
  customerId: "c1",
  issueDate: "2026-11-10",
  placeOfSupply: "27",
  lines: [{ description: "Steel rod", quantity: "2", rate: "1,250.50", taxRate: "18", hsnSac: "7214" }],
};

describe("validateDocument", () => {
  it("reads lines in paise and keeps entered values", () => {
    const r = validateDocument("invoices", { ...base, extraDate: "2026-11-25", invoiceDiscount: { type: "percent", value: "5" }, charges: [{ label: "Freight", amount: "100", taxRate: "18" }] });
    expect(r.ok && r.values).toMatchObject({
      partyId: "c1",
      extraDate: "2026-11-25",
      invoiceDiscount: { type: "percent", percent: "5" },
      charges: [{ label: "Freight", amountPaise: 10000, taxRate: "18" }],
      lines: [{ description: "Steel rod", quantity: "2", ratePaise: 125050, taxRate: "18", taxCategory: "taxable", hsnSac: "7214" }],
    });
  });

  it("checks dates and the order of dates", () => {
    expect(validateDocument("invoices", { ...base, issueDate: "2026-02-30" }).ok).toBe(false);
    const r = validateDocument("invoices", { ...base, extraDate: "2026-11-01" });
    expect(!r.ok && r.errors.extraDate).toMatch(/before/);
  });

  it("notes need an invoice and a reason; other types ignore them", () => {
    const r = validateDocument("credit-notes", base);
    expect(!r.ok && Object.keys(r.errors).sort()).toEqual(["invoiceId", "reason"]);
    const q = validateDocument("quotations", { ...base, invoiceId: "x", reason: "y" });
    expect(q.ok && q.values).toMatchObject({ sourceId: null, reason: null });
  });

  it("reports line problems by position", () => {
    const r = validateDocument("invoices", { ...base, lines: [{ description: "", quantity: "x", rate: "", hsnSac: "12", productId: "p", serviceId: "s" }] });
    expect(!r.ok && Object.keys(r.errors).sort()).toEqual(["lines.0.description", "lines.0.hsnSac", "lines.0.productId", "lines.0.quantity", "lines.0.rate"]);
  });

  it("needs a customer and a valid place of supply", () => {
    const r = validateDocument("invoices", { ...base, customerId: "", placeOfSupply: "55" });
    expect(!r.ok && Object.keys(r.errors).sort()).toEqual(["customerId", "placeOfSupply"]);
  });
});

describe("purchase documents", () => {
  const bill = { supplierId: "s1", issueDate: "2026-11-10", placeOfSupply: "27", partyReference: "SUP/123", lines: base.lines };

  it("bills need a supplier and the supplier's bill number", () => {
    const r = validateDocument("purchase-bills", bill);
    expect(r.ok && r.values).toMatchObject({ partyId: "s1", partyReference: "SUP/123" });
    const e = validateDocument("purchase-bills", { ...bill, supplierId: "", partyReference: "" });
    expect(!e.ok && Object.keys(e.errors).sort()).toEqual(["partyReference", "supplierId"]);
    // A customer id doesn't count for a purchase.
    expect(validateDocument("purchase-bills", { ...bill, supplierId: undefined, customerId: "c1" }).ok).toBe(false);
  });

  it("returns need the bill (billId) and a reason", () => {
    const e = validateDocument("purchase-returns", { supplierId: "s1", issueDate: "2026-11-10", lines: base.lines });
    expect(!e.ok && Object.keys(e.errors).sort()).toEqual(["billId", "reason"]);
    const ok = validateDocument("purchase-returns", { supplierId: "s1", issueDate: "2026-11-10", billId: "b1", reason: "Damaged", lines: base.lines });
    expect(ok.ok && ok.values).toMatchObject({ sourceId: "b1", reason: "Damaged" });
  });

  it("purchase orders have no bill number field", () => {
    const r = validateDocument("purchase-orders", { ...bill, partyReference: "x" });
    expect(r.ok && r.values.partyReference).toBeNull();
  });
});

describe("document types", () => {
  it("each type has a distinct numbering series and an issue action", () => {
    expect(new Set(DOCUMENT_SLUGS.map((s) => DOCUMENT_TYPES[s].numbering)).size).toBe(DOCUMENT_SLUGS.length);
    for (const s of DOCUMENT_SLUGS) expect(DOCUMENT_TYPES[s].statuses).toContain(DOCUMENT_TYPES[s].issuedStatus);
  });

  it("shows overdue invoices and expired quotations", () => {
    expect(displayStatus("invoices", "issued", "2026-11-01", "2026-11-10")).toBe("overdue");
    expect(displayStatus("invoices", "paid", "2026-11-01", "2026-11-10")).toBe("paid");
    expect(displayStatus("quotations", "sent", "2026-11-01", "2026-11-10")).toBe("expired");
    expect(displayStatus("quotations", "accepted", "2026-11-01", "2026-11-10")).toBe("accepted");
  });

  it("dates by India time", () => {
    expect(todayInIndia(new Date("2026-11-10T20:00:00Z"))).toBe("2026-11-11");
  });
});

describe("amountInWords", () => {
  it.each([
    [0, "Rupees Zero Only"],
    [100, "Rupees One Only"],
    [118000, "Rupees One Thousand One Hundred Eighty Only"],
    [123456, "Rupees One Thousand Two Hundred Thirty Four and Fifty Six Paise Only"],
    [1_00_000_00, "Rupees One Lakh Only"],
    [12_34_56_789_00, "Rupees Twelve Crore Thirty Four Lakh Fifty Six Thousand Seven Hundred Eighty Nine Only"],
    [1_000_00_00_000_00, "Rupees One Thousand Crore Only"],
  ])("%i paise", (paise, words) => {
    expect(amountInWords(paise)).toBe(words);
  });
});
