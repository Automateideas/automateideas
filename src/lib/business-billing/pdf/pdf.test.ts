import { describe, expect, it } from "vitest";

import { DEFAULT_TEMPLATE, templateFrom, tint, upiPayLink, validateTemplate } from "../template";
import { type PdfDocument, renderDocumentPdf, renderReceiptPdf } from "./document-pdf";

const seller = { legalName: "Alpha Traders Pvt Ltd", tradeName: null, gstin: "27ABCDE1234F1Z5", email: "a@example.test", phone: null, addressLine1: "1 MG Road", addressLine2: null, city: "Pune", state: "Maharashtra", postalCode: "411001", countryCode: "IN" };

const item = (n: number) => ({ id: `i${n}`, lineNo: n, description: `Item ${n} with a fairly long description`, hsnSac: "7214", quantity: "2.000", unitCode: "NOS", ratePaise: 50000, discountPaise: 0, taxCategory: "taxable", taxRate: "18.0000", cessRate: "0", taxablePaise: 100000, cgstPaise: 9000, sgstPaise: 9000, igstPaise: 0, cessPaise: 0, totalPaise: 118000 });

function doc(items: number, over: Partial<PdfDocument> = {}): PdfDocument {
  return {
    slug: "invoices",
    number: "INV/2026-27/0001",
    status: "issued",
    issueDate: "2026-11-10",
    extraDate: "2026-11-25",
    partyName: "Rahul Traders",
    partyGstin: "27AAACR1234E1Z2",
    billingAddress: { addressLine1: "2 FC Road", addressLine2: null, city: "Pune", state: "Maharashtra", postalCode: "411004", countryCode: "IN" },
    shippingAddress: null,
    placeOfSupply: "27",
    supplyType: "intra_state",
    reverseCharge: false,
    zeroRated: null,
    reason: null,
    subtotalPaise: 100000 * items,
    discountPaise: 0,
    taxablePaise: 100000 * items,
    cgstPaise: 9000 * items,
    sgstPaise: 9000 * items,
    igstPaise: 0,
    cessPaise: 0,
    roundOffPaise: 0,
    totalPaise: 118000 * items,
    charges: [],
    seller,
    notes: "Thanks!",
    terms: "Payment within 15 days.",
    items: Array.from({ length: items }, (_, i) => item(i + 1)),
    related: [],
    payment: { balancePaise: 118000 * items },
    ...over,
  };
}

const assets = (over: Partial<typeof DEFAULT_TEMPLATE> = {}) => ({ template: { ...DEFAULT_TEMPLATE, ...over }, logo: null, signature: null, stamp: null });
const pages = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;

describe("PDF rendering", () => {
  it("renders an A4 invoice with the rupee font embedded", async () => {
    const pdf = await renderDocumentPdf(doc(1), null, assets());
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pages(pdf)).toBe(1);
    expect(pdf.toString("latin1")).toMatch(/NotoSans/);
    expect(pdf.toString("latin1")).toMatch(/\/MediaBox \[0 0 595\.2\d* 841\.8\d*\]/); // A4 in points
  }, 30_000);

  it("flows long invoices onto more pages", async () => {
    const pdf = await renderDocumentPdf(doc(70), null, assets());
    expect(pages(pdf)).toBeGreaterThanOrEqual(3);
  }, 30_000);

  it("renders every design, the UPI QR, drafts and notes", async () => {
    for (const design of ["classic", "modern", "compact"] as const) {
      const pdf = await renderDocumentPdf(doc(3), null, assets({ design, color: "#1D4ED8", upiId: "alpha@okhdfc", bank: { bankName: "HDFC", accountName: "Alpha", accountNumber: "001234567890", ifsc: "HDFC0001234", branch: null } }));
      expect(pdf.subarray(0, 5).toString(), design).toBe("%PDF-");
    }
    const withQr = await renderDocumentPdf(doc(1), null, assets({ upiId: "alpha@okhdfc" }));
    const without = await renderDocumentPdf(doc(1), null, assets());
    expect(withQr.length).toBeGreaterThan(without.length); // the QR image
    const draft = await renderDocumentPdf(doc(1, { status: "draft", number: null, seller: null }), seller, assets());
    expect(draft.subarray(0, 5).toString()).toBe("%PDF-");
    const note = await renderDocumentPdf(doc(1, { slug: "credit-notes", extraDate: null, reason: "Returned", payment: null, related: [{ slug: "invoices", number: "INV/2026-27/0001" }] }), null, assets());
    expect(note.subarray(0, 5).toString()).toBe("%PDF-");
  }, 60_000);

  it("renders a payment receipt", async () => {
    const pdf = await renderReceiptPdf(
      { number: "REC/2026-27/0001", status: "recorded", customerName: "Rahul", paymentDate: "2026-11-12", amountPaise: 300000, allocatedPaise: 118000, method: "upi", reference: "UTR1", allocations: [{ id: "a", invoiceNumber: "INV/2026-27/0001", invoiceDate: "2026-11-10", amountPaise: 118000 }] },
      seller,
      assets(),
    );
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  }, 30_000);
});

describe("template settings", () => {
  it("validates colour, UPI ID and complete bank details", () => {
    expect(validateTemplate({ design: "modern", color: "#1d4ed8", upiId: "Shop@OKHDFC" })).toMatchObject({ ok: true, values: { design: "modern", color: "#1D4ED8", upiId: "shop@okhdfc", bank: null } });
    const bad = validateTemplate({ design: "fancy", color: "blue", upiId: "not-an-upi", bank: { bankName: "HDFC" } });
    expect(!bad.ok && Object.keys(bad.errors).sort()).toEqual(["bank.accountName", "bank.accountNumber", "bank.ifsc", "color", "design", "upiId"]);
  });

  it("falls back to defaults for stored junk", () => {
    expect(templateFrom({ design: "weird" })).toEqual(DEFAULT_TEMPLATE);
    expect(templateFrom(null)).toEqual(DEFAULT_TEMPLATE);
  });

  it("builds a UPI payment link and tints colours", () => {
    expect(upiPayLink({ upiId: "shop@okhdfc", payeeName: "Alpha Traders", amountPaise: 118050, note: "INV/2026-27/0001" })).toBe(
      "upi://pay?pa=shop%40okhdfc&pn=Alpha%20Traders&am=1180.50&cu=INR&tn=INV%2F2026-27%2F0001",
    );
    expect(tint("#000000", 0.5)).toBe("#808080");
  });
});
