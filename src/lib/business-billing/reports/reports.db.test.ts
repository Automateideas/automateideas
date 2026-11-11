import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { organization } from "@/db/schema";
import { removeTestTenants } from "@/test/cleanup-tenants";

import { balanceSheet, profitAndLoss } from "../accounting/service";
import { validateCustomer, validateSupplier } from "../contacts-validation";
import { createCustomer } from "../customers";
import { createDraft, issueDocument } from "../documents/service";
import type { DocumentSlug } from "../documents/types";
import { validateDocument } from "../documents/validation";
import { recordPayment } from "../payments/service";
import { recordSupplierPayment } from "../payments/supplier-payments";
import { saveBillingSettings } from "../settings";
import { createSupplier } from "../suppliers";
import { REPORTS, type ReportParams } from "./catalog";
import { billingDashboard } from "./dashboard";
import { reportIds, runReport } from "./service";
import { type ReportTable, toCsv, toXlsx } from "./table";

// Real database: every report agrees with the others and with the books.

const stamp = Date.now().toString(36);
const A = `reptest-a-${stamp}`;
const B = `reptest-b-${stamp}`;
const USER = null as unknown as string;
const ids: Record<string, string> = {};
const P: ReportParams = { from: "2026-04-01", to: "2026-11-30", asOf: "2026-11-30", groupBy: "month", customerId: null, supplierId: null, status: null };
const run = (id: string, over: Partial<ReportParams> = {}, org = A) => runReport(org, id, { ...P, ...over });
const col = (t: ReportTable, key: string) => t.rows.filter((r) => r._strong !== 1).reduce((a, r) => a + Number(r[key] ?? 0), 0);

const line = (over: Record<string, unknown> = {}) => ({ description: "Steel rod", hsnSac: "7214", quantity: "2", unitCode: "NOS", rate: "500", taxRate: "18", ...over });
async function issue(slug: DocumentSlug, over: Record<string, unknown> = {}) {
  const party = slug.startsWith("purchase") ? { supplierId: ids.supplier } : { customerId: ids.customer };
  const v = validateDocument(slug, { ...party, issueDate: "2026-11-10", partyReference: slug === "purchase-bills" ? `SB-${Math.random().toString(36).slice(2, 8)}` : undefined, lines: [line()], ...over });
  if (!v.ok) throw new Error(JSON.stringify(v.errors));
  return issueDocument(A, USER, slug, (await createDraft(A, USER, slug, v.values)).id);
}

beforeAll(async () => {
  await db.insert(organization).values([
    { id: A, name: "Rep A", slug: A, createdAt: new Date() },
    { id: B, name: "Rep B", slug: B, createdAt: new Date() },
  ]);
  const company = { legalName: "Report Co", tradeName: null, gstin: "27ABCDE1234F1Z5", pan: null, email: null, phone: null, addressLine1: null, addressLine2: null, city: null, state: null, postalCode: null, countryCode: "IN", currency: "INR" as const, financialYearStartMonth: 4, invoicePrefix: "INV" };
  await saveBillingSettings(A, USER, company);
  await saveBillingSettings(B, USER, { ...company, legalName: "Other Co" });
  const c = validateCustomer({ name: "Pune Buyer", paymentTermsDays: "15", billingAddress: { countryCode: "IN", stateCode: "27" } });
  const c2 = validateCustomer({ name: "Delhi Buyer", billingAddress: { countryCode: "IN", stateCode: "07" } });
  const s = validateSupplier({ name: "Pune Steel", gstin: "27AAACP1234A1Z5", stateCode: "27", countryCode: "IN" });
  if (!c.ok || !c2.ok || !s.ok) throw new Error("bad fixtures");
  ids.customer = (await createCustomer(A, USER, c.values)).id;
  ids.delhi = (await createCustomer(A, USER, c2.values)).id;
  ids.supplier = (await createSupplier(A, USER, s.values)).id;

  // October: one invoice (₹1,180). November: two invoices, a credit note, a debit note.
  ids.inv1 = (await issue("invoices", { issueDate: "2026-10-15" })).id;
  ids.inv2 = (await issue("invoices", { lines: [line({ quantity: "3" }), line({ description: "Cutting", hsnSac: "998898", unitCode: "", quantity: "1", rate: "200", taxRate: "5" })] })).id;
  ids.inv3 = (await issue("invoices", { customerId: ids.delhi })).id; // inter-state: IGST
  await issue("credit-notes", { invoiceId: ids.inv2, reason: "Damaged", lines: [line({ quantity: "1" })] });
  await issue("debit-notes", { invoiceId: ids.inv1, reason: "Short billed", lines: [line({ quantity: "1", rate: "100" })] });
  await recordPayment(A, USER, { customerId: ids.customer, paymentDate: "2026-11-10", amountPaise: 118000, method: "upi", reference: "UTR1", notes: null, allocations: [{ invoiceId: ids.inv1, amountPaise: 118000 }] }, null);

  ids.bill = (await issue("purchase-bills", { lines: [line({ quantity: "4", rate: "300" })] })).id;
  await issue("purchase-returns", { billId: ids.bill, reason: "Rusty", lines: [line({ quantity: "1", rate: "300" })] });
  await recordSupplierPayment(A, USER, { supplierId: ids.supplier, paymentDate: "2026-11-10", amountPaise: 50000, method: "cash", reference: null, notes: null, allocations: [{ billId: ids.bill, amountPaise: 50000 }] }, null);
});

afterAll(() => removeTestTenants([A, B]));

describe("sales", () => {
  it("invoice-wise: every invoice, totals, payment status", async () => {
    const t = await run("sales-register");
    expect(t.rows.map((r) => r.number)).toHaveLength(3);
    // ₹1,180 + (3 × ₹500 @ 18% = ₹1,770, plus ₹200 @ 5% = ₹210) + ₹1,180.
    expect(t.totals?.total).toBe(118000 + 198000 + 118000);
    // Invoice 1 is paid but then got a debit note, and invoice 2 a credit note: both partly settled.
    const partly = await run("sales-register", { status: "partially_paid" });
    expect(partly.rows.map((r) => r._href)).toEqual([`/billing/invoices/${ids.inv1}`, `/billing/invoices/${ids.inv2}`]);
    // Due 30 Oct (15-day terms) and still owing the debit note: overdue.
    expect(partly.rows[0]).toMatchObject({ paid: 118000, balance: 11800, due: "2026-10-30", status: "Overdue" });
    expect((await run("sales-register", { status: "overdue" })).rows.map((r) => r._href)).toEqual([`/billing/invoices/${ids.inv1}`]);
    const unpaid = await run("sales-register", { status: "unpaid" });
    expect(unpaid.rows.map((r) => r._href)).toEqual([`/billing/invoices/${ids.inv3}`]);
    expect((await run("sales-register", { status: "paid" })).rows).toHaveLength(0);
    const one = await run("sales-register", { customerId: ids.delhi });
    expect(one.rows).toHaveLength(1);
    expect(one.rows[0]).toMatchObject({ igst: 18000, cgst: 0 });
  });

  it("by period: net of notes; months add up to the P&L", async () => {
    const t = await run("sales-by-period");
    expect(t.rows.map((r) => r.period)).toEqual(["Oct 2026", "Nov 2026"]);
    const pl = await profitAndLoss(A, { from: P.from, to: P.to });
    expect(t.totals?.taxable).toBe(pl.income.totalPaise);
    const days = await run("sales-by-period", { groupBy: "day" });
    expect(days.totals?.total).toBe(t.totals?.total);
    const years = await run("sales-by-period", { groupBy: "year" });
    expect(years.rows.map((r) => r.period)).toEqual(["FY 2026-27"]);
  });

  it("by customer and by item agree with by period", async () => {
    const period = await run("sales-by-period");
    const byCustomer = await run("sales-by-customer");
    expect(byCustomer.totals?.total).toBe(period.totals?.total);
    expect(byCustomer.rows[0].customer).toBe("Pune Buyer");
    const byItem = await run("sales-by-item");
    expect(byItem.totals?.taxable).toBe(period.totals?.taxable);
    // 2 (Oct) + 3 (Nov) − 1 (credit note) + 2 + 1 (debit note) steel rods.
    expect(byItem.rows.find((r) => r.item === "Steel rod")?.qty).toBe(7);
  });
});

describe("purchases", () => {
  it("register, by supplier (net of returns) and returns agree", async () => {
    const reg = await run("purchase-register");
    const ret = await run("purchase-returns");
    const bySup = await run("purchases-by-supplier");
    expect(reg.rows).toHaveLength(1);
    expect(ret.rows).toHaveLength(1);
    expect(bySup.totals?.total).toBe(Number(reg.totals?.total) - Number(ret.totals?.total));
    expect(reg.rows[0]).toMatchObject({ total: 141600, balance: 141600 - 35400 - 50000, status: "Partly paid" });
  });
});

describe("payments", () => {
  it("collection, outstanding and cash flow match the books", async () => {
    const coll = await run("payment-collection");
    expect(coll.totals?.amount).toBe(118000);
    const out = await run("customer-outstanding");
    const reg = await run("sales-register");
    expect(out.totals?.total).toBe(reg.totals?.balance);
    const sup = await run("supplier-outstanding");
    expect(sup.totals?.total).toBe(141600 - 35400 - 50000);

    const cf = await run("cash-flow");
    const bs = await balanceSheet(A, P.to);
    const cashAndBank = bs.assets.lines.filter((l) => l.code === "1000" || l.code === "1010").reduce((a, l) => a + l.amountPaise, 0);
    expect(cf.rows.at(-1)?.net).toBe(cashAndBank);
    expect(cf.rows.find((r) => r.item === "Receipts from customers")).toMatchObject({ inflow: 118000, outflow: 0 });
    expect(cf.rows.find((r) => r.item === "Payments to suppliers")).toMatchObject({ inflow: 0, outflow: 50000 });
  });
});

describe("tax", () => {
  it("GST summary nets output against input, matching the dashboard", async () => {
    const t = await run("gst-summary");
    const net = t.rows.find((r) => String(r.section).startsWith("Net GST payable"));
    const d = await billingDashboard(A, { from: P.from, to: P.to, customerId: null });
    expect(net?.tax).toBe(d.tax?.netPaise);
    const output = t.rows.find((r) => r.section === "Output tax");
    expect(output?.tax).toBe(d.tax?.output.totalPaise);
  });

  it("HSN summary: one row per code and rate, totals equal net taxable sales", async () => {
    const t = await run("hsn-summary");
    expect(t.rows.map((r) => `${r.hsn}@${r.rate}`)).toEqual(["7214@18%", "998898@5%"]);
    expect(t.totals?.taxable).toBe((await run("sales-by-period")).totals?.taxable);
  });
});

describe("dashboard", () => {
  it("headline numbers and months agree with the reports", async () => {
    const d = await billingDashboard(A, { from: P.from, to: P.to, customerId: null });
    const period = await run("sales-by-period");
    expect(d.kpis.salesPaise).toBe(period.totals?.total);
    expect(d.kpis.invoices).toBe(3);
    expect(d.kpis.collectedPaise).toBe(118000);
    expect(d.monthly.find((m) => m.month === "2026-10")?.salesPaise).toBe(period.rows[0].total);
    expect(d.topCustomers[0].name).toBe("Pune Buyer");
    expect(d.recent.length).toBeGreaterThan(0);
    const one = await billingDashboard(A, { from: P.from, to: P.to, customerId: ids.delhi });
    expect(one.kpis).toMatchObject({ salesPaise: 118000, invoices: 1, purchasesPaise: null });
    expect(one.recent.every((r) => r.kind === "invoice" || r.kind === "payment")).toBe(true);
  });
});

describe("every report", () => {
  it("is tenant-scoped: another company sees nothing", async () => {
    for (const r of REPORTS) {
      const t = await run(r.id, {}, B);
      expect(t.rows.filter((x) => x._strong !== 1 && (Number(x.total ?? x.amount ?? x.net ?? 0) !== 0 || x.number)), r.id).toHaveLength(0);
    }
    const d = await billingDashboard(B, { from: P.from, to: P.to, customerId: null });
    expect(d.kpis.salesPaise).toBe(0);
    expect(d.recent).toHaveLength(0);
  });

  it("exports to CSV and Excel", async () => {
    for (const id of reportIds()) {
      const t = await run(id);
      expect(toCsv(t).split("\r\n").length, id).toBeGreaterThan(1);
      expect(toXlsx(t).byteLength, id).toBeGreaterThan(500);
      expect(col(t, t.columns[0].key)).toBeDefined();
    }
  });
});
