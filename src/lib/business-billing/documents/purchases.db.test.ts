import { inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { organization } from "@/db/schema";
import { countFinancialRecords } from "@/lib/financial-records";

import { validateSupplier } from "../contacts-validation";
import { saveBillingSettings } from "../settings";
import { createSupplier, getSupplier } from "../suppliers";
import { withTenant } from "../tenant-db";
import { allocateSupplierPayment, getSupplierPayment, payablesReport, recordSupplierPayment, supplierAccount, voidSupplierPayment } from "../payments/supplier-payments";
import { convertDocument, createDraft, getDocument, issueDocument, listDocuments, markPurchaseOrderReceived, updateDraft, voidDocument } from "./service";
import type { DocumentSlug } from "./types";
import { validateDocument } from "./validation";

// Real database: purchase orders, bills, returns and supplier payments.

const stamp = Date.now().toString(36);
const A = `purtest-a-${stamp}`;
const B = `purtest-b-${stamp}`;
const USER = null as unknown as string;
const S: Record<string, string> = {};

async function code(p: Promise<unknown>) {
  try {
    await p;
    return "ok";
  } catch (e) {
    return (e as { body?: { code?: string } }).body?.code ?? String((e as Error).message ?? e);
  }
}

const line = (over: Record<string, unknown> = {}) => ({ description: "Steel coil", hsnSac: "7208", quantity: "1", rate: "1000", taxRate: "18", ...over });
function values(slug: DocumentSlug, over: Record<string, unknown> = {}) {
  const r = validateDocument(slug, { supplierId: S.local, issueDate: "2026-11-10", partyReference: slug === "purchase-bills" ? `SB-${Math.random().toString(36).slice(2, 8)}` : undefined, lines: [line()], ...over });
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.values;
}
const bill = async (over: Record<string, unknown> = {}) => issueDocument(A, USER, "purchase-bills", (await createDraft(A, USER, "purchase-bills", values("purchase-bills", over))).id);
const pay = (amount: number, allocations: { billId: string; amountPaise: number }[] = [], supplierId = S.local) => ({ supplierId, paymentDate: "2026-11-15", amountPaise: amount, method: "bank_transfer" as const, reference: "UTR1", notes: null, allocations });

beforeAll(async () => {
  await db.insert(organization).values([
    { id: A, name: "Pur A", slug: A, createdAt: new Date() },
    { id: B, name: "Pur B", slug: B, createdAt: new Date() },
  ]);
  const company = { legalName: "Buyer Co", tradeName: null, gstin: "27ABCDE1234F1Z5", pan: null, email: null, phone: null, addressLine1: null, addressLine2: null, city: null, state: null, postalCode: null, countryCode: "IN", currency: "INR" as const, financialYearStartMonth: 4, invoicePrefix: "INV" };
  await saveBillingSettings(A, USER, company);
  const sup = async (org: string, name: string, extra: Record<string, unknown>) => {
    const v = validateSupplier({ name, countryCode: "IN", paymentTermsDays: "30", ...extra });
    if (!v.ok) throw new Error(JSON.stringify(v.errors));
    return (await createSupplier(org, USER, v.values)).id;
  };
  S.local = await sup(A, "Pune Steel", { gstin: "27AAACP1234A1Z5", stateCode: "27", openingBalance: "1000" });
  S.other = await sup(A, "Gujarat Steel", { gstin: "24AAACG1234A1Z5", stateCode: "24" });
  S.unreg = await sup(A, "Local Transporter", { stateCode: "27" });
});

afterAll(async () => {
  await db.transaction(async (tx) => {
    await tx.execute(sql`set local session_replication_role = replica`);
    const { rows } = await tx.execute<{ t: string }>(sql`select table_name as t from information_schema.columns where table_schema = 'public' and column_name = 'organization_id' and table_name not in ('member', 'invitation', 'subscription_payment')`);
    for (const { t } of rows) await tx.execute(sql`delete from ${sql.identifier(t)} where organization_id in (${A}, ${B})`);
  });
  await db.delete(organization).where(inArray(organization.id, [A, B]));
});

describe("GST on purchases (the supplier is the seller)", () => {
  it("same state: CGST + SGST; other state: IGST; place of supply is yours", async () => {
    const local = await createDraft(A, USER, "purchase-bills", values("purchase-bills"));
    expect(local).toMatchObject({ placeOfSupply: "27", supplyType: "intra_state", cgstPaise: 9000, sgstPaise: 9000, totalPaise: 118000, partyName: "Pune Steel", supplierId: S.local, customerId: null });
    const inter = await createDraft(A, USER, "purchase-bills", values("purchase-bills", { supplierId: S.other }));
    expect(inter).toMatchObject({ placeOfSupply: "27", supplyType: "inter_state", igstPaise: 18000, cgstPaise: 0 });
  });

  it("unregistered suppliers charge no GST; under reverse charge you work it out yourself", async () => {
    const plain = await createDraft(A, USER, "purchase-bills", values("purchase-bills", { supplierId: S.unreg }));
    expect(plain).toMatchObject({ taxPaise: 0, totalPaise: 100000 });
    const rcm = await createDraft(A, USER, "purchase-bills", values("purchase-bills", { supplierId: S.unreg, reverseCharge: true, lines: [line({ taxRate: "5" })] }));
    expect(rcm).toMatchObject({ supplyType: "intra_state", taxPaise: 5000, totalPaise: 100000 });
  });

  it("purchase lines default due date from the supplier's terms", async () => {
    const d = await createDraft(A, USER, "purchase-bills", values("purchase-bills"));
    expect(d.extraDate).toBe("2026-12-10");
  });
});

describe("purchase order → bill → return", () => {
  it("runs the full flow and marks each step", async () => {
    const po = await createDraft(A, USER, "purchase-orders", values("purchase-orders", { lines: [line({ quantity: "10" })] }));
    expect(po.partyReference).toBeNull();
    const sent = await issueDocument(A, USER, "purchase-orders", po.id);
    expect(sent).toMatchObject({ status: "sent", number: "PO/2026-27/0001" });
    expect((await markPurchaseOrderReceived(A, USER, po.id)).status).toBe("received");
    expect(await code(markPurchaseOrderReceived(A, USER, po.id))).toBe("WRONG_STATUS");

    const billDraft = await convertDocument(A, USER, "purchase-orders", po.id, "purchase-bills");
    expect(billDraft).toMatchObject({ status: "draft", purchaseOrderId: po.id, partyReference: null, totalPaise: 1180000 });
    expect(await code(issueDocument(A, USER, "purchase-bills", billDraft.id))).toBe("INVALID_FIELDS"); // supplier's bill number missing
    await updateDraft(A, USER, "purchase-bills", billDraft.id, values("purchase-bills", { partyReference: "PS/1001", lines: [line({ quantity: "10" })] }));
    const recorded = await issueDocument(A, USER, "purchase-bills", billDraft.id);
    expect(recorded).toMatchObject({ status: "recorded", number: "PB/2026-27/0001", partyReference: "PS/1001" });
    expect((await getDocument(A, "purchase-orders", po.id)).status).toBe("billed");
    expect(await code(voidDocument(A, USER, "purchase-orders", po.id, "x"))).toBe("CONVERTED");

    // Same supplier bill number again -> refused.
    expect(await code(createDraft(A, USER, "purchase-bills", values("purchase-bills", { partyReference: "PS/1001" })))).toBe("DUPLICATE");

    // Return 2 of the 10.
    const ret = await convertDocument(A, USER, "purchase-bills", recorded.id, "purchase-returns");
    expect(ret).toMatchObject({ sourceId: recorded.id, reason: null });
    await updateDraft(A, USER, "purchase-returns", ret.id, values("purchase-returns", { billId: recorded.id, reason: "Damaged", lines: [line({ quantity: "2" })] }));
    const issuedRet = await issueDocument(A, USER, "purchase-returns", ret.id);
    expect(issuedRet).toMatchObject({ number: "PR/2026-27/0001", totalPaise: 236000 });
    const after = await getDocument(A, "purchase-bills", recorded.id);
    expect(after).toMatchObject({ status: "partially_paid" });
    expect(after.payment?.balancePaise).toBe(944000);
    expect(after.related.map((r) => r.slug)).toEqual(["purchase-orders", "purchase-returns"]);

    // Returns can't exceed the bill.
    const tooMuch = await createDraft(A, USER, "purchase-returns", values("purchase-returns", { billId: recorded.id, reason: "All", lines: [line({ quantity: "9" })] }));
    expect(await code(issueDocument(A, USER, "purchase-returns", tooMuch.id))).toBe("INVALID_FIELDS");
    expect(await code(voidDocument(A, USER, "purchase-bills", recorded.id, "x"))).toBe("HAS_NOTES");
  });

  it("returns must point at a recorded bill of the same supplier", async () => {
    const draftBill = await createDraft(A, USER, "purchase-bills", values("purchase-bills"));
    expect(await code(createDraft(A, USER, "purchase-returns", values("purchase-returns", { billId: draftBill.id, reason: "x" })))).toBe("INVALID_FIELDS");
    const theirs = await bill({ supplierId: S.other });
    expect(await code(createDraft(A, USER, "purchase-returns", values("purchase-returns", { billId: theirs.id, reason: "x" })))).toBe("INVALID_FIELDS");
  });

  it("locks recorded bills, also in the database", async () => {
    const b = await bill();
    expect(await code(updateDraft(A, USER, "purchase-bills", b.id, values("purchase-bills")))).toBe("DOCUMENT_LOCKED");
    const hint = await withTenant(A, (tx) => tx.execute(sql`update purchase_bills set total_paise = 1 where id = ${b.id}`)).then(() => "ok", (e) => String((e as { cause?: { hint?: string } }).cause?.hint ?? e));
    expect(hint).toBe("DOCUMENT_LOCKED");
  });
});

describe("supplier payments", () => {
  it("pays several bills, keeps an advance, and updates statuses", async () => {
    const b1 = await bill();
    const b2 = await bill({ lines: [line({ quantity: "2" })] });
    const p = await recordSupplierPayment(A, USER, pay(400000, [{ billId: b1.id, amountPaise: 118000 }, { billId: b2.id, amountPaise: 100000 }]), null);
    expect(p).toMatchObject({ number: "PAY/2026-27/0001", allocatedPaise: 218000, unallocatedPaise: 182000 });
    expect((await getDocument(A, "purchase-bills", b1.id)).status).toBe("paid");
    expect((await getDocument(A, "purchase-bills", b2.id)).status).toBe("partially_paid");
    const b3 = await bill();
    expect((await allocateSupplierPayment(A, USER, p.id, [{ billId: b3.id, amountPaise: 118000 }])).unallocatedPaise).toBe(64000);
    expect(await code(recordSupplierPayment(A, USER, pay(10, [{ billId: b1.id, amountPaise: 10 }]), null))).toBe("INVALID_FIELDS"); // already paid
    expect(await code(voidDocument(A, USER, "purchase-bills", b1.id, "x"))).toBe("HAS_PAYMENTS");

    await voidSupplierPayment(A, USER, p.id, "Transfer bounced");
    expect((await getDocument(A, "purchase-bills", b1.id)).status).toBe("recorded");
    expect(await code(voidSupplierPayment(A, USER, p.id, "again"))).toBe("ALREADY_VOID");
  });

  it("is idempotent and never over-pays a bill under races", async () => {
    const b = await bill();
    const key = `sp-${stamp}`;
    const same = await Promise.all(Array.from({ length: 4 }, () => recordSupplierPayment(A, USER, pay(50000, [{ billId: b.id, amountPaise: 50000 }]), key)));
    expect(new Set(same.map((x) => x.id)).size).toBe(1);
    const race = await Promise.all(Array.from({ length: 4 }, () => code(recordSupplierPayment(A, USER, pay(68000, [{ billId: b.id, amountPaise: 68000 }]), null))));
    expect(race.filter((x) => x === "ok")).toHaveLength(1);
    expect((await getDocument(A, "purchase-bills", b.id)).status).toBe("paid");
  });

  it("refuses other suppliers' bills and other tenants", async () => {
    const theirs = await bill({ supplierId: S.other });
    expect(await code(recordSupplierPayment(A, USER, pay(1000, [{ billId: theirs.id, amountPaise: 1000 }]), null))).toBe("INVALID_FIELDS");
    expect(await code(recordSupplierPayment(B, USER, pay(1000, [], S.local), null))).toBe("INVALID_FIELDS");
    expect(await code(getDocument(B, "purchase-bills", theirs.id))).toBe("NOT_FOUND");
    const p = await recordSupplierPayment(A, USER, pay(1000, [], S.other), null);
    expect(await code(getSupplierPayment(B, p.id))).toBe("NOT_FOUND");
  });

  it("supplier account and payables add up", async () => {
    const acct = await supplierAccount(A, S.local);
    expect(acct.ledger.at(-1)?.balancePaise).toBe(acct.outstandingPaise);
    expect(acct.openingBalancePaise + acct.billedPaise - acct.returnedPaise - acct.paidPaise).toBe(acct.outstandingPaise);
    expect((await getSupplier(A, S.local)).outstandingPaise).toBe(acct.outstandingPaise);
    const report = await payablesReport(A, "2027-03-01");
    expect(report.totals.totalPaise).toBe(report.suppliers.reduce((a, s) => a + s.totalPaise, 0));
    expect(report.totals.overduePaise).toBeGreaterThan(0); // due 2026-12-10, so late by March
    const list = await listDocuments(A, "purchase-bills", { q: "PS/1001", page: 1, pageSize: 50, status: null, partyId: null });
    expect(list.items).toHaveLength(1); // search finds the supplier's bill number
    expect((await countFinancialRecords(A)).purchaseBills).toBeGreaterThan(0);
  });
});
