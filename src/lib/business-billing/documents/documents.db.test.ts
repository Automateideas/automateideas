import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { businessInvoiceItems, businessInvoices, organization } from "@/db/schema";
import { removeTestTenants } from "@/test/cleanup-tenants";
import { countFinancialRecords } from "@/lib/financial-records";

import { createProduct, createService, listUnits } from "../catalogue";
import { validateCustomer } from "../contacts-validation";
import { createCustomer, setCustomerArchived } from "../customers";
import { saveBillingSettings } from "../settings";
import { withTenant } from "../tenant-db";
import {
  convertDocument,
  createDraft,
  deleteDraft,
  getDocument,
  issueDocument,
  listDocuments,
  respondToQuotation,
  updateDraft,
  voidDocument,
} from "./service";
import type { DocumentSlug } from "./types";
import { validateDocument } from "./validation";

// Real database: the sales document lifecycle, locking and tenant isolation.

const stamp = Date.now().toString(36);
const A = `doctest-a-${stamp}`;
const B = `doctest-b-${stamp}`;
const USER = null as unknown as string;
let local = ""; // customer in Maharashtra (same state as the seller)
let interstate = ""; // customer in Karnataka
let productId = "";
let serviceId = "";

async function code(p: Promise<unknown>) {
  try {
    await p;
    return "ok";
  } catch (e) {
    return (e as { body?: { code?: string } }).body?.code ?? String((e as Error).message ?? e);
  }
}

const line = (over: Record<string, unknown> = {}) => ({ productId, description: "Steel rod", hsnSac: "7214", quantity: "2", unitCode: "NOS", rate: "500", taxRate: "18", ...over });

function values(slug: DocumentSlug, over: Record<string, unknown> = {}) {
  const r = validateDocument(slug, { customerId: local, issueDate: "2026-11-10", pricesIncludeTax: false, lines: [line()], ...over });
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.values;
}

beforeAll(async () => {
  await db.insert(organization).values([
    { id: A, name: "Docs A", slug: A, createdAt: new Date() },
    { id: B, name: "Docs B", slug: B, createdAt: new Date() },
  ]);
  const company = { legalName: "Alpha Traders Pvt Ltd", tradeName: null, gstin: "27ABCDE1234F1Z5", pan: null, email: null, phone: null, addressLine1: "1 MG Road", addressLine2: null, city: "Pune", state: null, postalCode: "411001", countryCode: "IN", currency: "INR" as const, financialYearStartMonth: 4, invoicePrefix: "ABC/" };
  await saveBillingSettings(A, USER, company);
  await saveBillingSettings(B, USER, { ...company, legalName: "Bravo", gstin: null });
  const cust = (name: string, stateCode: string, terms?: number) => {
    const v = validateCustomer({ name, paymentTermsDays: terms, billingAddress: { countryCode: "IN", stateCode } });
    if (!v.ok) throw new Error("bad customer");
    return v.values;
  };
  local = (await createCustomer(A, USER, cust("Pune Buyer", "27", 15))).id;
  interstate = (await createCustomer(A, USER, cust("Bengaluru Buyer", "29"))).id;
  const nos = (await listUnits(A)).find((u) => u.code === "NOS")!;
  productId = (await createProduct(A, USER, { name: "Steel rod", sku: "R1", barcode: null, description: null, brand: null, categoryId: null, unitId: nos.id, hsnCode: "7214", taxCategory: "taxable", taxRate: "18", cessRate: "0", salePricePaise: 50000, purchasePricePaise: 0, trackInventory: false, minStockQty: null })).id;
  serviceId = (await createService(A, USER, { name: "Fitting", code: null, description: null, categoryId: null, unitId: null, sacCode: "998729", taxCategory: "taxable", taxRate: "18", ratePaise: 10000 })).id;
});

// Issued documents and journals are locked by triggers; clean every tenant table with them off.
afterAll(() => removeTestTenants([A, B]));

describe("drafts", () => {
  let id = "";

  it("are calculated on the server, with place of supply and due date defaulted", async () => {
    const d = await createDraft(A, USER, "invoices", values("invoices"));
    id = d.id;
    expect(d).toMatchObject({ status: "draft", number: null, placeOfSupply: "27", supplyType: "intra_state", extraDate: "2026-11-25", taxablePaise: 100000, cgstPaise: 9000, sgstPaise: 9000, totalPaise: 118000, partyName: "Pune Buyer" });
    expect(d.items).toHaveLength(1);
    expect(d.items[0]).toMatchObject({ lineNo: 1, productId, taxablePaise: 100000, totalPaise: 118000 });
  });

  it("can be edited (lines replaced) and charged IGST for another state", async () => {
    const d = await updateDraft(A, USER, "invoices", id, values("invoices", { customerId: interstate, lines: [line(), line({ productId: null, serviceId, description: "Fitting", hsnSac: "998729", quantity: "1", rate: "100" })] }));
    expect(d).toMatchObject({ placeOfSupply: "29", supplyType: "inter_state", igstPaise: 19800, cgstPaise: 0, totalPaise: 129800, partyName: "Bengaluru Buyer" });
    expect(d.items.map((i) => i.lineNo)).toEqual([1, 2]);
  });

  it("refuse archived customers and other tenants' customers or products", async () => {
    const tmp = validateCustomer({ name: "Gone", billingAddress: { countryCode: "IN", stateCode: "27" } });
    if (!tmp.ok) throw new Error("x");
    const gone = await createCustomer(A, USER, tmp.values);
    await setCustomerArchived(A, USER, gone.id, true);
    expect(await code(createDraft(A, USER, "invoices", values("invoices", { customerId: gone.id })))).toBe("INVALID_FIELDS");
    expect(await code(createDraft(B, USER, "invoices", values("invoices")))).toBe("INVALID_FIELDS");
    const bCustomer = validateCustomer({ name: "B buyer", billingAddress: { countryCode: "IN", stateCode: "07" } });
    if (!bCustomer.ok) throw new Error("x");
    const bc = await createCustomer(B, USER, bCustomer.values);
    expect(await code(createDraft(B, USER, "invoices", values("invoices", { customerId: bc.id })))).toBe("INVALID_FIELDS"); // A's product
    expect(await code(getDocument(B, "invoices", id))).toBe("NOT_FOUND");
  });

  it("can be deleted, with their lines", async () => {
    const d = await createDraft(A, USER, "invoices", values("invoices"));
    await deleteDraft(A, "invoices", d.id);
    expect(await code(getDocument(A, "invoices", d.id))).toBe("NOT_FOUND");
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(businessInvoiceItems).where(eq(businessInvoiceItems.invoiceId, d.id));
    expect(n).toBe(0);
  });
});

describe("issuing and locking", () => {
  let id = "";

  it("numbers the invoice, copies the seller and locks it", async () => {
    const d = await createDraft(A, USER, "invoices", values("invoices"));
    id = d.id;
    const issued = await issueDocument(A, USER, "invoices", id);
    expect(issued).toMatchObject({ status: "issued", number: "ABC/2026-27/0001", financialYear: "2026-27", totalPaise: 118000 });
    expect(issued.seller).toMatchObject({ legalName: "Alpha Traders Pvt Ltd", gstin: "27ABCDE1234F1Z5", stateCode: "27", state: "Maharashtra" });
    expect(issued.issuedAt).toBeTruthy();
  });

  it("refuses edits, deletes and issuing twice through the app", async () => {
    expect(await code(updateDraft(A, USER, "invoices", id, values("invoices")))).toBe("DOCUMENT_LOCKED");
    expect(await code(deleteDraft(A, "invoices", id))).toBe("DOCUMENT_LOCKED");
    expect(await code(issueDocument(A, USER, "invoices", id))).toBe("ALREADY_ISSUED");
  });

  it("refuses edits even with direct SQL (database triggers)", async () => {
    const tryIt = (q: ReturnType<typeof sql>) => withTenant(A, (tx) => tx.execute(q)).then(() => "ok", (e) => String((e as { cause?: { hint?: string } }).cause?.hint ?? e));
    expect(await tryIt(sql`update business_invoices set total_paise = 1 where id = ${id}`)).toBe("DOCUMENT_LOCKED");
    expect(await tryIt(sql`delete from business_invoices where id = ${id}`)).toBe("DOCUMENT_LOCKED");
    expect(await tryIt(sql`update business_invoice_items set rate_paise = 1 where invoice_id = ${id}`)).toBe("DOCUMENT_LOCKED");
    expect(await tryIt(sql`insert into business_invoice_items (organization_id, invoice_id, line_no, description) values (${A}, ${id}, 9, 'sneaky')`)).toBe("DOCUMENT_LOCKED");
    expect(await tryIt(sql`update business_invoices set status = 'draft' where id = ${id}`)).toBe("DOCUMENT_LOCKED");
    const [row] = await db.select({ total: businessInvoices.totalPaise }).from(businessInvoices).where(eq(businessInvoices.id, id));
    expect(row.total).toBe(118000);
  });

  it("gives 10 drafts issued at once 10 consecutive numbers", async () => {
    const drafts = await Promise.all(Array.from({ length: 10 }, () => createDraft(A, USER, "invoices", values("invoices"))));
    const issued = await Promise.all(drafts.map((d) => issueDocument(A, USER, "invoices", d.id)));
    expect(issued.map((d) => d.number).sort()).toEqual(Array.from({ length: 10 }, (_, i) => `ABC/2026-27/${String(i + 2).padStart(4, "0")}`));
  });

  it("numbers by the document's own financial year", async () => {
    const d = await createDraft(A, USER, "invoices", values("invoices", { issueDate: "2027-04-02" }));
    expect((await issueDocument(A, USER, "invoices", d.id)).number).toBe("ABC/2027-28/0001");
  });

  it("voids, keeping the number; void is final", async () => {
    const d = await createDraft(A, USER, "invoices", values("invoices"));
    const issued = await issueDocument(A, USER, "invoices", d.id);
    const v = await voidDocument(A, USER, "invoices", d.id, "Wrong customer");
    expect(v).toMatchObject({ status: "void", number: issued.number, voidReason: "Wrong customer" });
    expect(await code(voidDocument(A, USER, "invoices", d.id, "again"))).toBe("ALREADY_VOID");
    const draft = await createDraft(A, USER, "invoices", values("invoices"));
    expect(await code(voidDocument(A, USER, "invoices", draft.id, "x"))).toBe("NOT_ISSUED");
  });

  it("counts issued documents as financial records", async () => {
    expect((await countFinancialRecords(A)).invoices).toBeGreaterThan(0);
  });

  it("lists drafts first and filters by status", async () => {
    const all = await listDocuments(A, "invoices", { q: null, page: 1, pageSize: 100, status: null, partyId: null });
    expect(all.items[0].status).toBe("draft");
    const voided = await listDocuments(A, "invoices", { q: null, page: 1, pageSize: 100, status: "void", partyId: null });
    expect(voided.items.every((d) => d.status === "void")).toBe(true);
    // An invoice from 2025 due in 2025 is overdue whatever today is.
    const old = await issueDocument(A, USER, "invoices", (await createDraft(A, USER, "invoices", values("invoices", { issueDate: "2025-06-01", extraDate: "2025-06-15" }))).id);
    const overdue = await listDocuments(A, "invoices", { q: null, page: 1, pageSize: 100, status: "overdue", partyId: null });
    expect(overdue.items.map((d) => d.id)).toContain(old.id);
    expect(overdue.items.find((d) => d.id === old.id)?.displayStatus).toBe("overdue");
  });
});

describe("quotations, orders and notes", () => {
  it("quotation → accepted → sales order → invoice, marking each source", async () => {
    const q = await createDraft(A, USER, "quotations", values("quotations", { extraDate: "2026-12-10" }));
    expect(await code(respondToQuotation(A, USER, q.id, "accepted"))).toBe("WRONG_STATUS");
    const sent = await issueDocument(A, USER, "quotations", q.id);
    expect(sent).toMatchObject({ status: "sent", number: "QT/2026-27/0001" });
    expect((await respondToQuotation(A, USER, q.id, "accepted")).status).toBe("accepted");

    const so = await convertDocument(A, USER, "quotations", q.id, "sales-orders");
    expect(so).toMatchObject({ status: "draft", quotationId: q.id, totalPaise: sent.totalPaise });
    const confirmed = await issueDocument(A, USER, "sales-orders", so.id);
    expect(confirmed).toMatchObject({ status: "confirmed", number: "SO/2026-27/0001" });
    expect((await getDocument(A, "quotations", q.id)).status).toBe("converted");

    const inv = await convertDocument(A, USER, "sales-orders", so.id, "invoices");
    expect(inv).toMatchObject({ salesOrderId: so.id, quotationId: q.id });
    await issueDocument(A, USER, "invoices", inv.id);
    expect((await getDocument(A, "sales-orders", so.id)).status).toBe("invoiced");
    expect((await getDocument(A, "sales-orders", so.id)).related.map((r) => r.slug)).toEqual(["quotations", "invoices"]);
    expect(await code(voidDocument(A, USER, "quotations", q.id, "x"))).toBe("CONVERTED");
    expect(await code(convertDocument(A, USER, "quotations", q.id, "credit-notes"))).toBe("INVALID_FIELDS");
  });

  it("credit notes need a reason, can't exceed the invoice, and block voiding the invoice", async () => {
    const inv = await issueDocument(A, USER, "invoices", (await createDraft(A, USER, "invoices", values("invoices"))).id);
    const cn = await convertDocument(A, USER, "invoices", inv.id, "credit-notes");
    expect(cn).toMatchObject({ status: "draft", invoiceId: inv.id, reason: null });
    expect(await code(issueDocument(A, USER, "credit-notes", cn.id))).toBe("INVALID_FIELDS");

    // Credit half, then try to credit the full amount again.
    const half = values("credit-notes", { invoiceId: inv.id, reason: "Half returned", lines: [line({ quantity: "1" })] });
    await updateDraft(A, USER, "credit-notes", cn.id, half);
    const issuedCn = await issueDocument(A, USER, "credit-notes", cn.id);
    expect(issuedCn).toMatchObject({ status: "issued", number: "CN/2026-27/0001", totalPaise: 59000 });
    const tooMuch = await createDraft(A, USER, "credit-notes", values("credit-notes", { invoiceId: inv.id, reason: "All", lines: [line()] }));
    expect(await code(issueDocument(A, USER, "credit-notes", tooMuch.id))).toBe("INVALID_FIELDS");

    expect(await code(voidDocument(A, USER, "invoices", inv.id, "x"))).toBe("HAS_NOTES");
    await voidDocument(A, USER, "credit-notes", cn.id, "Mistake");
    expect((await voidDocument(A, USER, "invoices", inv.id, "Cancelled")).status).toBe("void");
  });

  it("notes must point at an issued invoice of the same customer", async () => {
    const draftInv = await createDraft(A, USER, "invoices", values("invoices"));
    expect(await code(createDraft(A, USER, "debit-notes", values("debit-notes", { invoiceId: draftInv.id, reason: "Extra freight" })))).toBe("INVALID_FIELDS");
    const other = await issueDocument(A, USER, "invoices", (await createDraft(A, USER, "invoices", values("invoices", { customerId: interstate }))).id);
    expect(await code(createDraft(A, USER, "debit-notes", values("debit-notes", { invoiceId: other.id, reason: "x" })))).toBe("INVALID_FIELDS");
    const dn = await createDraft(A, USER, "debit-notes", values("debit-notes", { customerId: interstate, invoiceId: other.id, reason: "Extra freight", lines: [line({ quantity: "1", rate: "50" })] }));
    expect((await issueDocument(A, USER, "debit-notes", dn.id)).number).toBe("DN/2026-27/0001");
  });
});
