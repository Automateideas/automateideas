import { inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { organization } from "@/db/schema";

import { createProduct, listUnits } from "../catalogue";
import { validateCustomer } from "../contacts-validation";
import { createCustomer, getCustomer } from "../customers";
import { convertDocument, createDraft, getDocument, issueDocument, updateDraft, voidDocument } from "../documents/service";
import { validateDocument } from "../documents/validation";
import { saveBillingSettings } from "../settings";
import { withTenant } from "../tenant-db";
import {
  allocatePayment,
  customerAccount,
  getPayment,
  listPayments,
  outstandingReport,
  recordPayment,
  recordRefund,
  voidPayment,
  voidRefund,
} from "./service";
import type { PaymentValues } from "./validation";

// Real database: payments, allocations, advances, refunds and balances.

const stamp = Date.now().toString(36);
const A = `paytest-a-${stamp}`;
const B = `paytest-b-${stamp}`;
const USER = null as unknown as string;
let cust = "";
let other = "";
let productId = "";

async function code(p: Promise<unknown>) {
  try {
    await p;
    return "ok";
  } catch (e) {
    return (e as { body?: { code?: string } }).body?.code ?? String((e as Error).message ?? e);
  }
}

/** Issues an invoice of qty × ₹1,000 + 18% (same state): 1,180 per unit. */
async function invoice(qty = "1", customerId = cust, issueDate = "2026-11-10", dueDate?: string) {
  const v = validateDocument("invoices", {
    customerId,
    issueDate,
    extraDate: dueDate,
    lines: [{ productId, description: "Widget", quantity: qty, rate: "1000", taxRate: "18" }],
  });
  if (!v.ok) throw new Error(JSON.stringify(v.errors));
  const d = await createDraft(A, USER, "invoices", v.values);
  return issueDocument(A, USER, "invoices", d.id);
}

const pay = (amount: number, allocations: { invoiceId: string; amountPaise: number }[] = [], over: Partial<PaymentValues> = {}): PaymentValues => ({
  customerId: cust,
  paymentDate: "2026-11-12",
  amountPaise: amount,
  method: "upi",
  reference: "UTR1",
  notes: null,
  allocations,
  ...over,
});

beforeAll(async () => {
  await db.insert(organization).values([
    { id: A, name: "Pay A", slug: A, createdAt: new Date() },
    { id: B, name: "Pay B", slug: B, createdAt: new Date() },
  ]);
  const company = { legalName: "Alpha", tradeName: null, gstin: "27ABCDE1234F1Z5", pan: null, email: null, phone: null, addressLine1: null, addressLine2: null, city: null, state: null, postalCode: null, countryCode: "IN", currency: "INR" as const, financialYearStartMonth: 4, invoicePrefix: "INV" };
  await saveBillingSettings(A, USER, company);
  const c = (name: string, opening = "0") => {
    const v = validateCustomer({ name, openingBalance: opening, billingAddress: { countryCode: "IN", stateCode: "27" } });
    if (!v.ok) throw new Error("bad");
    return v.values;
  };
  cust = (await createCustomer(A, USER, c("Payer", "500"))).id;
  other = (await createCustomer(A, USER, c("Someone else"))).id;
  const nos = (await listUnits(A)).find((u) => u.code === "NOS")!;
  productId = (await createProduct(A, USER, { name: "Widget", sku: null, barcode: null, description: null, brand: null, categoryId: null, unitId: nos.id, hsnCode: null, taxCategory: "taxable", taxRate: "18", cessRate: "0", salePricePaise: 100000, purchasePricePaise: 0, trackInventory: false, minStockQty: null })).id;
});

afterAll(async () => {
  // Financial records are locked; remove this test's rows with triggers off (FK cascades off too, so every table).
  await db.transaction(async (tx) => {
    await tx.execute(sql`set local session_replication_role = replica`);
    const { rows } = await tx.execute<{ t: string }>(sql`select table_name as t from information_schema.columns where table_schema = 'public' and column_name = 'organization_id' and table_name not in ('member', 'invitation', 'subscription_payment')`);
    for (const { t } of rows) await tx.execute(sql`delete from ${sql.identifier(t)} where organization_id in (${A}, ${B})`);
  });
  await db.delete(organization).where(inArray(organization.id, [A, B]));
});

describe("recording payments", () => {
  it("settles one invoice fully and numbers the receipt", async () => {
    const inv = await invoice();
    const p = await recordPayment(A, USER, pay(118000, [{ invoiceId: inv.id, amountPaise: 118000 }]), null);
    expect(p).toMatchObject({ number: "REC/2026-27/0001", amountPaise: 118000, allocatedPaise: 118000, unallocatedPaise: 0, replayed: false });
    const after = await getDocument(A, "invoices", inv.id);
    expect(after.status).toBe("paid");
    expect(after.payment).toMatchObject({ paidPaise: 118000, balancePaise: 0 });
  });

  it("splits one payment across invoices, part-pays, and keeps the rest as advance", async () => {
    const i1 = await invoice();
    const i2 = await invoice("2");
    const p = await recordPayment(A, USER, pay(300000, [{ invoiceId: i1.id, amountPaise: 118000 }, { invoiceId: i2.id, amountPaise: 100000 }]), null);
    expect(p).toMatchObject({ allocatedPaise: 218000, unallocatedPaise: 82000 });
    expect((await getDocument(A, "invoices", i1.id)).status).toBe("paid");
    const half = await getDocument(A, "invoices", i2.id);
    expect(half.status).toBe("partially_paid");
    expect(half.payment?.balancePaise).toBe(136000);

    // The advance can be applied later, but not beyond what the invoice owes.
    expect(await code(allocatePayment(A, USER, p.id, [{ invoiceId: i2.id, amountPaise: 1 }]))).toBe("INVALID_FIELDS"); // already applied to i2
    const i3 = await invoice();
    expect(await code(allocatePayment(A, USER, p.id, [{ invoiceId: i3.id, amountPaise: 90000 }]))).toBe("INVALID_FIELDS"); // only 82,000 left
    const applied = await allocatePayment(A, USER, p.id, [{ invoiceId: i3.id, amountPaise: 82000 }]);
    expect(applied.unallocatedPaise).toBe(0);
    expect((await getDocument(A, "invoices", i3.id)).status).toBe("partially_paid");
  });

  it("refuses over-allocation, other customers' invoices, drafts and voids", async () => {
    const inv = await invoice();
    expect(await code(recordPayment(A, USER, pay(200000, [{ invoiceId: inv.id, amountPaise: 118001 }]), null))).toBe("INVALID_FIELDS");
    expect(await code(recordPayment(A, USER, pay(100, [{ invoiceId: inv.id, amountPaise: 200 }]), null))).toBe("INVALID_FIELDS");
    const theirs = await invoice("1", other);
    expect(await code(recordPayment(A, USER, pay(1000, [{ invoiceId: theirs.id, amountPaise: 1000 }]), null))).toBe("INVALID_FIELDS");
    const draft = await createDraft(A, USER, "invoices", (validateDocument("invoices", { customerId: cust, issueDate: "2026-11-10", lines: [{ description: "x", quantity: "1", rate: "10" }] }) as unknown as { values: Parameters<typeof createDraft>[3] }).values);
    expect(await code(recordPayment(A, USER, pay(1000, [{ invoiceId: draft.id, amountPaise: 1000 }]), null))).toBe("INVALID_FIELDS");
    // Another tenant can't touch it.
    expect(await code(recordPayment(B, USER, pay(1000, [{ invoiceId: inv.id, amountPaise: 1000 }]), null))).toBe("INVALID_FIELDS");
  });

  it("is idempotent: the same key records once, even when sent at the same moment", async () => {
    const inv = await invoice();
    const key = `key-${stamp}-1`;
    const results = await Promise.all(Array.from({ length: 5 }, () => recordPayment(A, USER, pay(50000, [{ invoiceId: inv.id, amountPaise: 50000 }]), key)));
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    expect(results.filter((r) => !r.replayed)).toHaveLength(1);
    expect((await getDocument(A, "invoices", inv.id)).payment?.paidPaise).toBe(50000);
  });

  it("never over-pays an invoice when two payments race for it", async () => {
    const inv = await invoice();
    const tries = await Promise.all(Array.from({ length: 4 }, () => code(recordPayment(A, USER, pay(100000, [{ invoiceId: inv.id, amountPaise: 100000 }]), null))));
    expect(tries.filter((t) => t === "ok")).toHaveLength(1);
    expect((await getDocument(A, "invoices", inv.id)).payment?.paidPaise).toBe(100000);
  });
});

describe("voiding and locking", () => {
  it("void reopens the invoices; void is final; refunds block it", async () => {
    const inv = await invoice();
    const p = await recordPayment(A, USER, pay(118000, [{ invoiceId: inv.id, amountPaise: 118000 }]), null);
    expect(await code(voidDocument(A, USER, "invoices", inv.id, "x"))).toBe("HAS_PAYMENTS");
    const v = await voidPayment(A, USER, p.id, "Cheque bounced");
    expect(v).toMatchObject({ status: "void", unallocatedPaise: 0 });
    expect((await getDocument(A, "invoices", inv.id)).status).toBe("issued");
    expect(await code(voidPayment(A, USER, p.id, "again"))).toBe("ALREADY_VOID");
    expect(await code(allocatePayment(A, USER, p.id, [{ invoiceId: inv.id, amountPaise: 1 }]))).toBe("PAYMENT_VOID");
    // With no payments left, the invoice can now be voided.
    expect((await voidDocument(A, USER, "invoices", inv.id, "Cancelled")).status).toBe("void");
  });

  it("database triggers refuse edits and deletes of payments and allocations", async () => {
    const inv = await invoice();
    const p = await recordPayment(A, USER, pay(1000, [{ invoiceId: inv.id, amountPaise: 1000 }]), null);
    const tryIt = (q: ReturnType<typeof sql>) => withTenant(A, (tx) => tx.execute(q)).then(() => "ok", (e) => String((e as { cause?: { hint?: string } }).cause?.hint ?? e));
    expect(await tryIt(sql`update business_payments set amount_paise = 1 where id = ${p.id}`)).toBe("DOCUMENT_LOCKED");
    expect(await tryIt(sql`delete from business_payments where id = ${p.id}`)).toBe("DOCUMENT_LOCKED");
    expect(await tryIt(sql`update payment_allocations set amount_paise = 1 where payment_id = ${p.id}`)).toBe("DOCUMENT_LOCKED");
    expect(await tryIt(sql`delete from payment_allocations where payment_id = ${p.id}`)).toBe("DOCUMENT_LOCKED");
    expect((await getPayment(A, p.id)).amountPaise).toBe(1000);
  });
});

describe("credit notes, refunds and the customer account", () => {
  it("a credit note reduces what's owed; on a paid invoice the excess can be refunded", async () => {
    const inv = await invoice("2"); // 2,360
    await recordPayment(A, USER, pay(236000, [{ invoiceId: inv.id, amountPaise: 236000 }]), null);
    const cnDraft = await convertDocument(A, USER, "invoices", inv.id, "credit-notes");
    const cnValues = validateDocument("credit-notes", { customerId: cust, issueDate: "2026-11-13", invoiceId: inv.id, reason: "One returned", lines: [{ productId, description: "Widget", quantity: "1", rate: "1000", taxRate: "18" }] });
    if (!cnValues.ok) throw new Error("bad cn");
    await updateDraft(A, USER, "credit-notes", cnDraft.id, cnValues.values);
    const cn = await issueDocument(A, USER, "credit-notes", cnDraft.id);
    const over = await getDocument(A, "invoices", inv.id);
    expect(over.payment?.balancePaise).toBe(-118000); // paid in full, then credited 1,180

    const refundVals = { customerId: cust, paymentId: null, creditNoteId: cn.id, refundDate: "2026-11-14", amountPaise: 118001, method: "upi" as const, reference: null, notes: null };
    expect(await code(recordRefund(A, USER, refundVals, null))).toBe("INVALID_FIELDS");
    const r = await recordRefund(A, USER, { ...refundVals, amountPaise: 118000 }, `refund-${stamp}`);
    expect(r).toMatchObject({ number: "RF/2026-27/0001", amountPaise: 118000 });
    expect((await getDocument(A, "invoices", inv.id)).payment?.balancePaise).toBe(0);
    // Same key: no second refund.
    expect((await recordRefund(A, USER, { ...refundVals, amountPaise: 118000 }, `refund-${stamp}`)).replayed).toBe(true);
    await voidRefund(A, USER, r.id, "Bank rejected");
    expect((await getDocument(A, "invoices", inv.id)).payment?.balancePaise).toBe(-118000);
  });

  it("refunds an unused advance, but not more than is left", async () => {
    const p = await recordPayment(A, USER, pay(50000), null);
    const base = { customerId: cust, paymentId: p.id, creditNoteId: null, refundDate: "2026-11-15", method: "bank_transfer" as const, reference: "UTR9", notes: null };
    expect(await code(recordRefund(A, USER, { ...base, amountPaise: 50001 }, null))).toBe("INVALID_FIELDS");
    await recordRefund(A, USER, { ...base, amountPaise: 20000 }, null);
    expect((await getPayment(A, p.id)).unallocatedPaise).toBe(30000);
    expect(await code(voidPayment(A, USER, p.id, "x"))).toBe("HAS_REFUNDS");
  });

  it("customer account: ledger balance equals the customer's outstanding", async () => {
    const acct = await customerAccount(A, cust);
    const detail = await getCustomer(A, cust);
    expect(acct.outstandingPaise).toBe(detail.outstandingPaise);
    expect(acct.ledger[0]).toMatchObject({ kind: "opening", balancePaise: 50000 });
    expect(acct.ledger.at(-1)?.balancePaise).toBe(acct.outstandingPaise);
    const sum = acct.openingBalancePaise + acct.invoicedPaise - acct.creditedPaise - acct.receivedPaise + acct.refundedPaise;
    expect(sum).toBe(acct.outstandingPaise);
  });

  it("outstanding report ages unpaid invoices by due date", async () => {
    await invoice("1", other, "2026-06-01", "2026-06-15"); // long overdue
    const report = await outstandingReport(A, "2026-11-20");
    const row = report.customers.find((c) => c.customerId === other)!;
    expect(row.ageing.d90_plus).toBeGreaterThanOrEqual(118000);
    expect(report.totals.totalPaise).toBe(report.customers.reduce((a, c) => a + c.totalPaise, 0));
    const listed = await listPayments(A, { q: null, status: "all", page: 1, pageSize: 100, customerId: cust });
    expect(listed.total).toBeGreaterThan(0);
  });
});
