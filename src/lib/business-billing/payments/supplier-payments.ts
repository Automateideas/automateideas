import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";

import { businessPayments, paymentAllocations, purchaseBills, purchaseReturns, suppliers } from "@/db/schema";

import { todayInIndia } from "../documents/types";
import { assertOpenPeriod, postPayment, reverseSource } from "../accounting/posting";
import { allocateDocumentNumber } from "../numbering";
import { type ListQuery, conflict, invalid, notFound, paged, searchFilter } from "../records";
import { type TenantTx, withTenant } from "../tenant-db";
import { type BillBalance, billBalances, openBills, refreshBillStatus } from "./balances";
import type { PaymentMethod } from "./validation";

// Payments made to suppliers: the purchase-side twin of customer payments
// (./service.ts). Same tables (business_payments with direction "made",
// payment_allocations against purchase bills) and the same rules:
// - one transaction, bills locked in id order, no allocation above what a bill owes;
// - what isn't allocated is an advance to the supplier, applied later;
// - an idempotency key makes retries safe;
// - never edited or deleted, only voided (database triggers).

export type SupplierAllocation = { billId: string; amountPaise: number };
export type SupplierPaymentValues = {
  supplierId: string;
  paymentDate: string;
  amountPaise: number;
  method: PaymentMethod;
  reference: string | null;
  notes: string | null;
  allocations: SupplierAllocation[];
};

const isUnique = (e: unknown, name: string) => {
  for (let x = e as { code?: string; constraint?: string; cause?: unknown } | undefined, i = 0; x && i < 4; i++) {
    if (x.code === "23505" && x.constraint === name) return true;
    x = x.cause as typeof x;
  }
  return false;
};

async function allocatedTotal(tx: TenantTx, organizationId: string, paymentId: string) {
  const [a] = await tx
    .select({ n: sql<number>`coalesce(sum(${paymentAllocations.amountPaise}), 0)`.mapWith(Number) })
    .from(paymentAllocations)
    .where(and(eq(paymentAllocations.organizationId, organizationId), eq(paymentAllocations.paymentId, paymentId)));
  return a.n;
}

async function readSupplierPayment(tx: TenantTx, organizationId: string, id: string) {
  const [p] = await tx
    .select({ payment: businessPayments, supplierName: suppliers.name })
    .from(businessPayments)
    .innerJoin(suppliers, and(eq(suppliers.organizationId, businessPayments.organizationId), eq(suppliers.id, businessPayments.supplierId)))
    .where(and(eq(businessPayments.organizationId, organizationId), eq(businessPayments.id, id), eq(businessPayments.direction, "made")));
  if (!p) notFound("supplier payment");
  const allocations = await tx
    .select({
      id: paymentAllocations.id,
      billId: paymentAllocations.purchaseBillId,
      amountPaise: paymentAllocations.amountPaise,
      billNumber: purchaseBills.number,
      supplierBillNumber: purchaseBills.supplierBillNumber,
      billDate: purchaseBills.issueDate,
    })
    .from(paymentAllocations)
    .innerJoin(purchaseBills, and(eq(purchaseBills.organizationId, paymentAllocations.organizationId), eq(purchaseBills.id, paymentAllocations.purchaseBillId)))
    .where(and(eq(paymentAllocations.organizationId, organizationId), eq(paymentAllocations.paymentId, id)))
    .orderBy(asc(paymentAllocations.createdAt));
  const allocatedPaise = await allocatedTotal(tx, organizationId, id);
  const x = p.payment;
  return {
    id: x.id,
    number: x.number,
    status: x.status,
    supplierId: x.supplierId!,
    supplierName: p.supplierName,
    paymentDate: x.paymentDate,
    amountPaise: x.amountPaise,
    method: x.method,
    reference: x.reference,
    notes: x.notes,
    voidedAt: x.voidedAt,
    voidReason: x.voidReason,
    createdAt: x.createdAt,
    allocations,
    allocatedPaise,
    /** Advance with the supplier: paid but not set against a bill. */
    unallocatedPaise: x.status === "recorded" ? x.amountPaise - allocatedPaise : 0,
  };
}

export type SupplierPaymentDetail = Awaited<ReturnType<typeof readSupplierPayment>>;

export async function getSupplierPayment(organizationId: string, id: string) {
  return withTenant(organizationId, (tx) => readSupplierPayment(tx, organizationId, id));
}

export async function listSupplierPayments(organizationId: string, q: ListQuery & { supplierId: string | null }) {
  return withTenant(organizationId, async (tx) => {
    const join = and(eq(suppliers.organizationId, businessPayments.organizationId), eq(suppliers.id, businessPayments.supplierId));
    const filter = and(
      eq(businessPayments.organizationId, organizationId),
      eq(businessPayments.direction, "made"),
      q.status === "archived" ? eq(businessPayments.status, "void") : q.status === "active" ? eq(businessPayments.status, "recorded") : undefined,
      q.supplierId ? eq(businessPayments.supplierId, q.supplierId) : undefined,
      searchFilter(q.q, [businessPayments.number, businessPayments.reference, suppliers.name]),
    );
    const [{ n: total }] = await tx.select({ n: count() }).from(businessPayments).innerJoin(suppliers, join).where(filter);
    const allocated = sql<number>`coalesce((select sum(a.amount_paise) from payment_allocations a where a.organization_id = ${organizationId} and a.payment_id = "business_payments"."id"), 0)`.mapWith(Number);
    const rows = await tx
      .select({
        id: businessPayments.id,
        number: businessPayments.number,
        status: businessPayments.status,
        paymentDate: businessPayments.paymentDate,
        amountPaise: businessPayments.amountPaise,
        method: businessPayments.method,
        reference: businessPayments.reference,
        supplierId: businessPayments.supplierId,
        supplierName: suppliers.name,
        allocatedPaise: allocated,
      })
      .from(businessPayments)
      .innerJoin(suppliers, join)
      .where(filter)
      .orderBy(desc(businessPayments.paymentDate), desc(businessPayments.createdAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    return paged(rows.map((r) => ({ ...r, unallocatedPaise: r.status === "recorded" ? r.amountPaise - r.allocatedPaise : 0 })), total, q);
  });
}

async function checkBillAllocations(tx: TenantTx, organizationId: string, supplierId: string, allocations: SupplierAllocation[]): Promise<Map<string, BillBalance>> {
  const ids = [...new Set(allocations.map((a) => a.billId))].sort();
  if (!ids.length) return new Map();
  await tx.execute(sql`select id from purchase_bills where organization_id = ${organizationId} and id in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)}) order by id for update`);
  const balances = await billBalances(tx, organizationId, ids);
  allocations.forEach((a, i) => {
    const b = balances.get(a.billId);
    if (!b) invalid({ [`allocations.${i}.billId`]: "This bill doesn't exist." });
    if (b.supplierId !== supplierId) invalid({ [`allocations.${i}.billId`]: `Bill ${b.number ?? ""} is from a different supplier.` });
    if (!["recorded", "partially_paid", "paid"].includes(b.status)) invalid({ [`allocations.${i}.billId`]: `Bill ${b.number ?? "(draft)"} isn't recorded, or is void.` });
    if (a.amountPaise > b.balancePaise) {
      invalid({ [`allocations.${i}.amount`]: b.balancePaise > 0 ? `Bill ${b.number} only has ${(b.balancePaise / 100).toFixed(2)} rupees left to pay.` : `Bill ${b.number} is already paid.` }, "An allocation is more than the bill still owes.");
    }
  });
  return balances;
}

async function insertBillAllocations(tx: TenantTx, organizationId: string, userId: string, paymentId: string, allocations: SupplierAllocation[]) {
  if (!allocations.length) return;
  await tx.insert(paymentAllocations).values(allocations.map((a) => ({ organizationId, paymentId, purchaseBillId: a.billId, amountPaise: a.amountPaise, createdBy: userId, updatedBy: userId })));
  for (const a of allocations) await refreshBillStatus(tx, organizationId, a.billId);
}

async function requireSupplier(tx: TenantTx, organizationId: string, supplierId: string) {
  const [s] = await tx.select({ archivedAt: suppliers.archivedAt }).from(suppliers).where(and(eq(suppliers.organizationId, organizationId), eq(suppliers.id, supplierId)));
  if (!s) invalid({ supplierId: "Choose a supplier." });
  if (s.archivedAt) invalid({ supplierId: "This supplier is archived. Restore them first." });
}

export async function recordSupplierPayment(organizationId: string, userId: string, v: SupplierPaymentValues, idempotencyKey: string | null) {
  const existing = async () => {
    if (!idempotencyKey) return null;
    return withTenant(organizationId, async (tx) => {
      const [p] = await tx.select({ id: businessPayments.id }).from(businessPayments).where(and(eq(businessPayments.organizationId, organizationId), eq(businessPayments.idempotencyKey, idempotencyKey)));
      return p ? { ...(await readSupplierPayment(tx, organizationId, p.id)), replayed: true } : null;
    });
  };
  const before = await existing();
  if (before) return before;
  try {
    return await withTenant(organizationId, async (tx) => {
      await requireSupplier(tx, organizationId, v.supplierId);
      if (v.allocations.reduce((a, x) => a + x.amountPaise, 0) > v.amountPaise) invalid({ allocations: "You've allocated more than the amount paid." });
      await checkBillAllocations(tx, organizationId, v.supplierId, v.allocations);
      await assertOpenPeriod(tx, organizationId, v.paymentDate, "paymentDate");
      const n = await allocateDocumentNumber(tx, organizationId, { documentType: "supplier_payment", date: new Date(`${v.paymentDate}T00:00:00Z`) });
      const [row] = await tx
        .insert(businessPayments)
        .values({
          organizationId,
          direction: "made",
          supplierId: v.supplierId,
          number: n.number,
          paymentDate: v.paymentDate,
          amountPaise: v.amountPaise,
          method: v.method,
          reference: v.reference,
          notes: v.notes,
          idempotencyKey,
          createdBy: userId,
          updatedBy: userId,
        })
        .returning({ id: businessPayments.id });
      await insertBillAllocations(tx, organizationId, userId, row.id, v.allocations);
      const detail = await readSupplierPayment(tx, organizationId, row.id);
      // Dr Creditors, Cr Cash/Bank, in this same transaction.
      await postPayment(tx, organizationId, { id: detail.id, number: detail.number, direction: "made", date: detail.paymentDate, amountPaise: detail.amountPaise, method: detail.method, partyId: detail.supplierId, partyName: detail.supplierName }, { userId });
      return { ...detail, replayed: false };
    });
  } catch (e) {
    if (isUnique(e, "business_payments_idempotency_uq")) {
      const again = await existing();
      if (again) return again;
    }
    throw e;
  }
}

export async function allocateSupplierPayment(organizationId: string, userId: string, paymentId: string, allocations: SupplierAllocation[]) {
  if (!allocations.length) invalid({ allocations: "Choose at least one bill and amount." });
  return withTenant(organizationId, async (tx) => {
    const [p] = await tx
      .select()
      .from(businessPayments)
      .where(and(eq(businessPayments.organizationId, organizationId), eq(businessPayments.id, paymentId), eq(businessPayments.direction, "made")))
      .for("update");
    if (!p) notFound("supplier payment");
    if (p.status !== "recorded") conflict("PAYMENT_VOID", "This payment is void.");
    const available = p.amountPaise - (await allocatedTotal(tx, organizationId, paymentId));
    if (allocations.reduce((a, x) => a + x.amountPaise, 0) > available) invalid({ allocations: `Only ${(available / 100).toFixed(2)} rupees of this payment is unallocated.` }, "That's more than the payment has left.");
    const already = await tx
      .select({ id: paymentAllocations.id })
      .from(paymentAllocations)
      .where(and(eq(paymentAllocations.organizationId, organizationId), eq(paymentAllocations.paymentId, paymentId), inArray(paymentAllocations.purchaseBillId, allocations.map((a) => a.billId))));
    if (already.length) invalid({ allocations: "This payment is already applied to one of these bills." });
    await checkBillAllocations(tx, organizationId, p.supplierId!, allocations);
    await insertBillAllocations(tx, organizationId, userId, paymentId, allocations);
    return readSupplierPayment(tx, organizationId, paymentId);
  });
}

export async function voidSupplierPayment(organizationId: string, userId: string, paymentId: string, reason: string) {
  return withTenant(organizationId, async (tx) => {
    const [p] = await tx
      .select()
      .from(businessPayments)
      .where(and(eq(businessPayments.organizationId, organizationId), eq(businessPayments.id, paymentId), eq(businessPayments.direction, "made")))
      .for("update");
    if (!p) notFound("supplier payment");
    if (p.status === "void") conflict("ALREADY_VOID", "This payment is already void.");
    const allocs = await tx
      .select({ billId: paymentAllocations.purchaseBillId })
      .from(paymentAllocations)
      .where(and(eq(paymentAllocations.organizationId, organizationId), eq(paymentAllocations.paymentId, paymentId)));
    await tx
      .update(businessPayments)
      .set({ status: "void", voidedAt: new Date(), voidReason: reason, updatedBy: userId })
      .where(and(eq(businessPayments.organizationId, organizationId), eq(businessPayments.id, paymentId)));
    for (const a of allocs) await refreshBillStatus(tx, organizationId, a.billId);
    await reverseSource(tx, organizationId, "payment_made", paymentId, todayInIndia(), `Void payment ${p.number ?? ""}: ${reason}`, userId);
    return readSupplierPayment(tx, organizationId, paymentId);
  });
}

/** Recorded bills of a supplier that still owe something (for the payment form). */
export async function billsToPay(organizationId: string, supplierId: string) {
  return withTenant(organizationId, async (tx) => {
    const open = await openBills(tx, organizationId, supplierId);
    return open.map((b) => ({ id: b.id, number: b.number, supplierBillNumber: b.supplierBillNumber, issueDate: b.issueDate, dueDate: b.dueDate, totalPaise: b.totalPaise, balancePaise: b.balancePaise }));
  });
}

/* ---------------- Supplier account and payables ---------------- */

/** Running statement of what you owe a supplier. */
export async function supplierAccount(organizationId: string, supplierId: string) {
  return withTenant(organizationId, async (tx) => {
    const [s] = await tx
      .select({ id: suppliers.id, name: suppliers.name, openingBalancePaise: suppliers.openingBalancePaise })
      .from(suppliers)
      .where(and(eq(suppliers.organizationId, organizationId), eq(suppliers.id, supplierId)));
    if (!s) notFound("supplier");
    const bills = await tx
      .select({ id: purchaseBills.id, number: purchaseBills.number, ref: purchaseBills.supplierBillNumber, date: purchaseBills.issueDate, total: purchaseBills.totalPaise, at: purchaseBills.issuedAt })
      .from(purchaseBills)
      .where(and(eq(purchaseBills.organizationId, organizationId), eq(purchaseBills.supplierId, supplierId), inArray(purchaseBills.status, ["recorded", "partially_paid", "paid"])));
    const returns = await tx
      .select({ id: purchaseReturns.id, number: purchaseReturns.number, date: purchaseReturns.issueDate, total: purchaseReturns.totalPaise, at: purchaseReturns.issuedAt })
      .from(purchaseReturns)
      .where(and(eq(purchaseReturns.organizationId, organizationId), eq(purchaseReturns.supplierId, supplierId), eq(purchaseReturns.status, "issued")));
    const pays = await tx
      .select({ id: businessPayments.id, number: businessPayments.number, date: businessPayments.paymentDate, total: businessPayments.amountPaise, at: businessPayments.createdAt })
      .from(businessPayments)
      .where(and(eq(businessPayments.organizationId, organizationId), eq(businessPayments.supplierId, supplierId), eq(businessPayments.direction, "made"), eq(businessPayments.status, "recorded")));

    // Owed to the supplier: bills (+), returns and payments (−).
    type Ev = { date: string; at: Date | null; kind: "bill" | "purchase_return" | "supplier_payment"; id: string; number: string | null; owed: number; paid: number };
    const events: Ev[] = [
      ...bills.map((x) => ({ date: x.date, at: x.at, kind: "bill" as const, id: x.id, number: x.ref ? `${x.number} (${x.ref})` : x.number, owed: x.total, paid: 0 })),
      ...returns.map((x) => ({ date: x.date, at: x.at, kind: "purchase_return" as const, id: x.id, number: x.number, owed: 0, paid: x.total })),
      ...pays.map((x) => ({ date: x.date, at: x.at, kind: "supplier_payment" as const, id: x.id, number: x.number, owed: 0, paid: x.total })),
    ].sort((a, b) => (a.date === b.date ? (a.at?.getTime() ?? 0) - (b.at?.getTime() ?? 0) : a.date < b.date ? -1 : 1));
    let balance = s.openingBalancePaise;
    const ledger: { date: string; kind: string; id: string | null; number: string | null; debitPaise: number; creditPaise: number; balancePaise: number }[] = [];
    if (s.openingBalancePaise !== 0) {
      ledger.push({ date: events[0]?.date ?? todayInIndia(), kind: "opening", id: null, number: null, debitPaise: Math.max(0, -s.openingBalancePaise), creditPaise: Math.max(0, s.openingBalancePaise), balancePaise: balance });
    }
    // Supplier ledger convention: what you owe goes on the credit side.
    for (const e of events) {
      balance += e.owed - e.paid;
      ledger.push({ date: e.date, kind: e.kind, id: e.id, number: e.number, debitPaise: e.paid, creditPaise: e.owed, balancePaise: balance });
    }
    const open = await openBills(tx, organizationId, supplierId);
    const sum = (xs: { total: number }[]) => xs.reduce((a, x) => a + x.total, 0);
    const [adv] = await tx.execute<{ n: string | number }>(sql`
      select coalesce(sum(p.amount_paise - coalesce((select sum(a.amount_paise) from payment_allocations a where a.organization_id = p.organization_id and a.payment_id = p.id), 0)), 0) as n
      from business_payments p
      where p.organization_id = ${organizationId} and p.supplier_id = ${supplierId} and p.status = 'recorded' and p.direction = 'made'`).then((r) => r.rows);
    return {
      supplierId: s.id,
      supplierName: s.name,
      openingBalancePaise: s.openingBalancePaise,
      billedPaise: sum(bills),
      returnedPaise: sum(returns),
      paidPaise: sum(pays),
      /** Positive: you owe the supplier. Negative: they hold your advance. */
      outstandingPaise: balance,
      unallocatedAdvancePaise: Number(adv?.n ?? 0),
      openBills: open.map((b) => ({ id: b.id, number: b.number, supplierBillNumber: b.supplierBillNumber, issueDate: b.issueDate, dueDate: b.dueDate, totalPaise: b.totalPaise, balancePaise: b.balancePaise })),
      ledger,
    };
  });
}

/** Unpaid bills by supplier, aged by due date. */
export async function payablesReport(organizationId: string, today: string = todayInIndia()) {
  return withTenant(organizationId, async (tx) => {
    const open = await openBills(tx, organizationId, null);
    const names = await tx.select({ id: suppliers.id, name: suppliers.name }).from(suppliers).where(eq(suppliers.organizationId, organizationId));
    const nameOf = new Map(names.map((n) => [n.id, n.name]));
    const day = (s: string) => Date.parse(`${s}T00:00:00Z`) / 86_400_000;
    type Bucket = "current" | "d1_30" | "d31_60" | "d61_90" | "d90_plus";
    const bucketOf = (due: string): Bucket => {
      const late = day(today) - day(due);
      if (late <= 0) return "current";
      if (late <= 30) return "d1_30";
      if (late <= 60) return "d31_60";
      if (late <= 90) return "d61_90";
      return "d90_plus";
    };
    const empty = () => ({ current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90_plus: 0 });
    const bySupplier = new Map<string, { supplierId: string; supplierName: string; bills: number; totalPaise: number; overduePaise: number; ageing: ReturnType<typeof empty> }>();
    const totals = { bills: 0, totalPaise: 0, overduePaise: 0, ageing: empty() };
    for (const b of open) {
      const bucket = bucketOf(b.dueDate ?? b.issueDate);
      const row = bySupplier.get(b.supplierId) ?? { supplierId: b.supplierId, supplierName: nameOf.get(b.supplierId) ?? "", bills: 0, totalPaise: 0, overduePaise: 0, ageing: empty() };
      row.bills += 1;
      row.totalPaise += b.balancePaise;
      row.ageing[bucket] += b.balancePaise;
      if (bucket !== "current") row.overduePaise += b.balancePaise;
      bySupplier.set(b.supplierId, row);
      totals.bills += 1;
      totals.totalPaise += b.balancePaise;
      totals.ageing[bucket] += b.balancePaise;
      if (bucket !== "current") totals.overduePaise += b.balancePaise;
    }
    return { today, totals, suppliers: [...bySupplier.values()].sort((a, b) => b.overduePaise - a.overduePaise || b.totalPaise - a.totalPaise) };
  });
}
