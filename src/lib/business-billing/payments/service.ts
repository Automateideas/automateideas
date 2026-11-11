import { and, asc, count, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";

import {
  businessInvoices,
  businessPayments,
  creditNotes,
  customers,
  debitNotes,
  paymentAllocations,
  refunds,
} from "@/db/schema";

import { assertOpenPeriod, postPayment, postRefund, reverseSource } from "../accounting/posting";
import { allocateDocumentNumber } from "../numbering";
import { type ListQuery, conflict, invalid, notFound, paged, searchFilter } from "../records";
import { type TenantTx, withTenant } from "../tenant-db";
import { todayInIndia } from "../documents/types";
import { type InvoiceBalance, invoiceBalances, openInvoices, refreshInvoiceStatus } from "./balances";
import type { AllocationValues, PaymentValues, RefundValues } from "./validation";

// Customer payments (receipts), their allocation to invoices, advances and refunds.
//
// - Recording a payment is one transaction: the invoices it settles are
//   locked (FOR UPDATE, in id order so two payments can't deadlock), each
//   allocation is checked against what the invoice still owes, a receipt
//   number is taken, and the invoices' statuses are updated.
// - Whatever isn't allocated stays with the customer as an advance; it can be
//   applied to invoices later or refunded.
// - An idempotency key (sent by the client per submit) makes retries safe: the
//   same key returns the payment already recorded instead of a second one.
// - Payments, allocations and refunds are never edited or deleted, only
//   voided (database triggers: drizzle/*_lock_payments).

const isUnique = (e: unknown, name: string) => {
  for (let x = e as { code?: string; constraint?: string; cause?: unknown } | undefined, i = 0; x && i < 4; i++) {
    if (x.code === "23505" && x.constraint === name) return true;
    x = x.cause as typeof x;
  }
  return false;
};

/* ---------------- Reading ---------------- */

async function paymentTotals(tx: TenantTx, organizationId: string, paymentId: string) {
  const [alloc] = await tx
    .select({ n: sql<number>`coalesce(sum(${paymentAllocations.amountPaise}), 0)`.mapWith(Number) })
    .from(paymentAllocations)
    .where(and(eq(paymentAllocations.organizationId, organizationId), eq(paymentAllocations.paymentId, paymentId)));
  const [ref] = await tx
    .select({ n: sql<number>`coalesce(sum(${refunds.amountPaise}), 0)`.mapWith(Number) })
    .from(refunds)
    .where(and(eq(refunds.organizationId, organizationId), eq(refunds.paymentId, paymentId), eq(refunds.status, "recorded")));
  return { allocatedPaise: alloc.n, refundedPaise: ref.n };
}

async function readPayment(tx: TenantTx, organizationId: string, id: string) {
  const [p] = await tx
    .select({ payment: businessPayments, customerName: customers.name })
    .from(businessPayments)
    .innerJoin(customers, and(eq(customers.organizationId, businessPayments.organizationId), eq(customers.id, businessPayments.customerId)))
    .where(and(eq(businessPayments.organizationId, organizationId), eq(businessPayments.id, id), eq(businessPayments.direction, "received")));
  if (!p) notFound("payment");
  const allocations = await tx
    .select({
      id: paymentAllocations.id,
      invoiceId: paymentAllocations.invoiceId,
      amountPaise: paymentAllocations.amountPaise,
      invoiceNumber: businessInvoices.number,
      invoiceDate: businessInvoices.issueDate,
      invoiceTotalPaise: businessInvoices.totalPaise,
      createdAt: paymentAllocations.createdAt,
    })
    .from(paymentAllocations)
    .innerJoin(businessInvoices, and(eq(businessInvoices.organizationId, paymentAllocations.organizationId), eq(businessInvoices.id, paymentAllocations.invoiceId)))
    .where(and(eq(paymentAllocations.organizationId, organizationId), eq(paymentAllocations.paymentId, id)))
    .orderBy(asc(paymentAllocations.createdAt));
  const refundRows = await tx
    .select({ id: refunds.id, number: refunds.number, refundDate: refunds.refundDate, amountPaise: refunds.amountPaise, method: refunds.method, status: refunds.status })
    .from(refunds)
    .where(and(eq(refunds.organizationId, organizationId), eq(refunds.paymentId, id)))
    .orderBy(asc(refunds.createdAt));
  const { allocatedPaise, refundedPaise } = await paymentTotals(tx, organizationId, id);
  const x = p.payment;
  return {
    id: x.id,
    number: x.number,
    status: x.status,
    customerId: x.customerId!,
    customerName: p.customerName,
    paymentDate: x.paymentDate,
    amountPaise: x.amountPaise,
    method: x.method,
    reference: x.reference,
    notes: x.notes,
    voidedAt: x.voidedAt,
    voidReason: x.voidReason,
    createdAt: x.createdAt,
    allocations,
    refunds: refundRows,
    allocatedPaise,
    refundedPaise,
    /** Advance left: not allocated to invoices and not refunded. */
    unallocatedPaise: x.status === "recorded" ? x.amountPaise - allocatedPaise - refundedPaise : 0,
  };
}

export type PaymentDetail = Awaited<ReturnType<typeof readPayment>>;

export async function getPayment(organizationId: string, id: string) {
  return withTenant(organizationId, (tx) => readPayment(tx, organizationId, id));
}

export async function listPayments(organizationId: string, q: ListQuery & { customerId: string | null }) {
  return withTenant(organizationId, async (tx) => {
    const filter = and(
      eq(businessPayments.organizationId, organizationId),
      eq(businessPayments.direction, "received"),
      q.status === "archived" ? eq(businessPayments.status, "void") : q.status === "active" ? eq(businessPayments.status, "recorded") : undefined,
      q.customerId ? eq(businessPayments.customerId, q.customerId) : undefined,
      searchFilter(q.q, [businessPayments.number, businessPayments.reference, customers.name]),
    );
    const base = tx
      .select({ n: count() })
      .from(businessPayments)
      .innerJoin(customers, and(eq(customers.organizationId, businessPayments.organizationId), eq(customers.id, businessPayments.customerId)));
    const [{ n: total }] = await base.where(filter);
    const allocated = sql<number>`coalesce((select sum(a.amount_paise) from payment_allocations a where a.organization_id = ${organizationId} and a.payment_id = "business_payments"."id"), 0)`.mapWith(Number);
    const refunded = sql<number>`coalesce((select sum(r.amount_paise) from refunds r where r.organization_id = ${organizationId} and r.payment_id = "business_payments"."id" and r.status = 'recorded'), 0)`.mapWith(Number);
    const rows = await tx
      .select({
        id: businessPayments.id,
        number: businessPayments.number,
        status: businessPayments.status,
        paymentDate: businessPayments.paymentDate,
        amountPaise: businessPayments.amountPaise,
        method: businessPayments.method,
        reference: businessPayments.reference,
        customerId: businessPayments.customerId,
        customerName: customers.name,
        allocatedPaise: allocated,
        refundedPaise: refunded,
      })
      .from(businessPayments)
      .innerJoin(customers, and(eq(customers.organizationId, businessPayments.organizationId), eq(customers.id, businessPayments.customerId)))
      .where(filter)
      .orderBy(desc(businessPayments.paymentDate), desc(businessPayments.createdAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const items = rows.map((r) => ({ ...r, unallocatedPaise: r.status === "recorded" ? r.amountPaise - r.allocatedPaise - r.refundedPaise : 0 }));
    return paged(items, total, q);
  });
}

/* ---------------- Allocating ---------------- */

/**
 * Locks the invoices and checks each allocation: same customer, issued (not
 * draft or void), and no more than what's still owed.
 */
async function checkAllocations(tx: TenantTx, organizationId: string, customerId: string, allocations: AllocationValues[]): Promise<Map<string, InvoiceBalance>> {
  const ids = [...new Set(allocations.map((a) => a.invoiceId))].sort();
  if (!ids.length) return new Map();
  // Lock in a fixed order so concurrent payments queue instead of deadlocking.
  await tx.execute(sql`select id from business_invoices where organization_id = ${organizationId} and id in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)}) order by id for update`);
  const balances = await invoiceBalances(tx, organizationId, ids);
  allocations.forEach((a, i) => {
    const b = balances.get(a.invoiceId);
    const field = `allocations.${i}.amount`;
    if (!b) invalid({ [`allocations.${i}.invoiceId`]: "This invoice doesn't exist." });
    if (b.customerId !== customerId) invalid({ [`allocations.${i}.invoiceId`]: `Invoice ${b.number ?? ""} is for a different customer.` });
    if (!["issued", "partially_paid", "paid"].includes(b.status)) invalid({ [`allocations.${i}.invoiceId`]: `Invoice ${b.number ?? "(draft)"} isn't issued, or is void.` });
    if (a.amountPaise > b.balancePaise) {
      invalid({ [field]: b.balancePaise > 0 ? `Invoice ${b.number} only has ${(b.balancePaise / 100).toFixed(2)} rupees left to pay.` : `Invoice ${b.number} is already paid.` }, "An allocation is more than the invoice still owes.");
    }
  });
  return balances;
}

async function insertAllocations(tx: TenantTx, organizationId: string, userId: string, paymentId: string, allocations: AllocationValues[]) {
  if (!allocations.length) return;
  await tx.insert(paymentAllocations).values(
    allocations.map((a) => ({ organizationId, paymentId, invoiceId: a.invoiceId, amountPaise: a.amountPaise, createdBy: userId, updatedBy: userId })),
  );
  for (const a of allocations) await refreshInvoiceStatus(tx, organizationId, a.invoiceId);
}

async function requireCustomer(tx: TenantTx, organizationId: string, customerId: string) {
  const [c] = await tx
    .select({ id: customers.id, archivedAt: customers.archivedAt })
    .from(customers)
    .where(and(eq(customers.organizationId, organizationId), eq(customers.id, customerId)));
  if (!c) invalid({ customerId: "Choose a customer." });
  if (c.archivedAt) invalid({ customerId: "This customer is archived. Restore them first." });
}

/* ---------------- Recording ---------------- */

/**
 * Records a payment received. With an idempotency key, a repeat of the same
 * request returns the payment already recorded (`replayed: true`).
 */
export async function recordPayment(organizationId: string, userId: string, v: PaymentValues, idempotencyKey: string | null) {
  const existing = async () => {
    if (!idempotencyKey) return null;
    return withTenant(organizationId, async (tx) => {
      const [p] = await tx
        .select({ id: businessPayments.id })
        .from(businessPayments)
        .where(and(eq(businessPayments.organizationId, organizationId), eq(businessPayments.idempotencyKey, idempotencyKey)));
      return p ? { ...(await readPayment(tx, organizationId, p.id)), replayed: true } : null;
    });
  };
  const before = await existing();
  if (before) return before;

  try {
    return await withTenant(organizationId, async (tx) => {
      await requireCustomer(tx, organizationId, v.customerId);
      const allocated = v.allocations.reduce((a, x) => a + x.amountPaise, 0);
      if (allocated > v.amountPaise) invalid({ allocations: "You've allocated more than the amount received." });
      await checkAllocations(tx, organizationId, v.customerId, v.allocations);
      await assertOpenPeriod(tx, organizationId, v.paymentDate, "paymentDate");
      const n = await allocateDocumentNumber(tx, organizationId, { documentType: "payment", date: new Date(`${v.paymentDate}T00:00:00Z`) });
      const [row] = await tx
        .insert(businessPayments)
        .values({
          organizationId,
          direction: "received",
          customerId: v.customerId,
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
      await insertAllocations(tx, organizationId, userId, row.id, v.allocations);
      const detail = await readPayment(tx, organizationId, row.id);
      // Dr Cash/Bank, Cr Debtors, in this same transaction.
      await postPayment(tx, organizationId, { id: detail.id, number: detail.number, direction: "received", date: detail.paymentDate, amountPaise: detail.amountPaise, method: detail.method, partyId: detail.customerId, partyName: detail.customerName }, { userId });
      return { ...detail, replayed: false };
    });
  } catch (e) {
    // Two identical requests at the same moment: the second one hits the unique key.
    if (isUnique(e, "business_payments_idempotency_uq")) {
      const again = await existing();
      if (again) return again;
    }
    throw e;
  }
}

/** Applies part of a payment's advance to invoices. */
export async function allocatePayment(organizationId: string, userId: string, paymentId: string, allocations: AllocationValues[]) {
  if (!allocations.length) invalid({ allocations: "Choose at least one invoice and amount." });
  return withTenant(organizationId, async (tx) => {
    const [p] = await tx
      .select()
      .from(businessPayments)
      .where(and(eq(businessPayments.organizationId, organizationId), eq(businessPayments.id, paymentId), eq(businessPayments.direction, "received")))
      .for("update");
    if (!p) notFound("payment");
    if (p.status !== "recorded") conflict("PAYMENT_VOID", "This payment is void.");
    const { allocatedPaise, refundedPaise } = await paymentTotals(tx, organizationId, paymentId);
    const available = p.amountPaise - allocatedPaise - refundedPaise;
    const wanted = allocations.reduce((a, x) => a + x.amountPaise, 0);
    if (wanted > available) invalid({ allocations: `Only ${(available / 100).toFixed(2)} rupees of this payment is unallocated.` }, "That's more than the payment has left.");
    const already = await tx
      .select({ invoiceId: paymentAllocations.invoiceId })
      .from(paymentAllocations)
      .where(and(eq(paymentAllocations.organizationId, organizationId), eq(paymentAllocations.paymentId, paymentId), inArray(paymentAllocations.invoiceId, allocations.map((a) => a.invoiceId))));
    if (already.length) invalid({ allocations: "This payment is already applied to one of these invoices. Record the rest as a separate payment." });
    await checkAllocations(tx, organizationId, p.customerId!, allocations);
    await insertAllocations(tx, organizationId, userId, paymentId, allocations);
    return readPayment(tx, organizationId, paymentId);
  });
}

/** Voids a payment: its allocations stop counting and the invoices owe again. */
export async function voidPayment(organizationId: string, userId: string, paymentId: string, reason: string) {
  return withTenant(organizationId, async (tx) => {
    const [p] = await tx
      .select()
      .from(businessPayments)
      .where(and(eq(businessPayments.organizationId, organizationId), eq(businessPayments.id, paymentId), eq(businessPayments.direction, "received")))
      .for("update");
    if (!p) notFound("payment");
    if (p.status === "void") conflict("ALREADY_VOID", "This payment is already void.");
    const { refundedPaise } = await paymentTotals(tx, organizationId, paymentId);
    if (refundedPaise > 0) conflict("HAS_REFUNDS", "Part of this payment was refunded. Void the refund first.");
    const allocs = await tx
      .select({ invoiceId: paymentAllocations.invoiceId })
      .from(paymentAllocations)
      .where(and(eq(paymentAllocations.organizationId, organizationId), eq(paymentAllocations.paymentId, paymentId)));
    await tx
      .update(businessPayments)
      .set({ status: "void", voidedAt: new Date(), voidReason: reason, updatedBy: userId })
      .where(and(eq(businessPayments.organizationId, organizationId), eq(businessPayments.id, paymentId)));
    for (const a of allocs) await refreshInvoiceStatus(tx, organizationId, a.invoiceId);
    await reverseSource(tx, organizationId, "payment_received", paymentId, todayInIndia(), `Void payment ${p.number ?? ""}: ${reason}`, userId);
    return readPayment(tx, organizationId, paymentId);
  });
}

/* ---------------- Refunds ---------------- */

async function creditNoteRefundable(tx: TenantTx, organizationId: string, creditNoteId: string) {
  const [cn] = await tx
    .select()
    .from(creditNotes)
    .where(and(eq(creditNotes.organizationId, organizationId), eq(creditNotes.id, creditNoteId)));
  if (!cn) invalid({ creditNoteId: "Choose a credit note." });
  if (cn.status !== "issued") invalid({ creditNoteId: "Only issued credit notes can be refunded." });
  const [ref] = await tx
    .select({ n: sql<number>`coalesce(sum(${refunds.amountPaise}), 0)`.mapWith(Number) })
    .from(refunds)
    .where(and(eq(refunds.organizationId, organizationId), eq(refunds.creditNoteId, creditNoteId), eq(refunds.status, "recorded")));
  // Only the part of the credit the invoice couldn't absorb (it was already paid) is cash to give back.
  const b = cn.invoiceId ? (await invoiceBalances(tx, organizationId, [cn.invoiceId])).get(cn.invoiceId) : null;
  const overCredited = b ? Math.max(0, -b.balancePaise) : 0;
  return { cn, refundable: Math.min(overCredited, cn.totalPaise - ref.n) };
}

export async function recordRefund(organizationId: string, userId: string, v: RefundValues, idempotencyKey: string | null) {
  const existing = async () => {
    if (!idempotencyKey) return null;
    return withTenant(organizationId, async (tx) => {
      const [r] = await tx.select().from(refunds).where(and(eq(refunds.organizationId, organizationId), eq(refunds.idempotencyKey, idempotencyKey)));
      return r ? { ...r, replayed: true } : null;
    });
  };
  const before = await existing();
  if (before) return before;
  try {
    return await withTenant(organizationId, async (tx) => {
      await requireCustomer(tx, organizationId, v.customerId);
      let invoiceToRefresh: string | null = null;
      if (v.paymentId) {
        const [p] = await tx
          .select()
          .from(businessPayments)
          .where(and(eq(businessPayments.organizationId, organizationId), eq(businessPayments.id, v.paymentId), eq(businessPayments.direction, "received")))
          .for("update");
        if (!p) invalid({ paymentId: "Choose a payment." });
        if (p.customerId !== v.customerId) invalid({ paymentId: "This payment is from a different customer." });
        if (p.status !== "recorded") invalid({ paymentId: "This payment is void." });
        const { allocatedPaise, refundedPaise } = await paymentTotals(tx, organizationId, p.id);
        const available = p.amountPaise - allocatedPaise - refundedPaise;
        if (v.amountPaise > available) invalid({ amount: available > 0 ? `Only ${(available / 100).toFixed(2)} rupees of this payment is unused.` : "Nothing of this payment is left to refund." });
      } else {
        await tx.execute(sql`select id from credit_notes where organization_id = ${organizationId} and id = ${v.creditNoteId} for update`);
        const { cn, refundable } = await creditNoteRefundable(tx, organizationId, v.creditNoteId!);
        if (cn.customerId !== v.customerId) invalid({ creditNoteId: "This credit note is for a different customer." });
        if (v.amountPaise > refundable) {
          invalid({ amount: refundable > 0 ? `Up to ${(refundable / 100).toFixed(2)} rupees can be refunded on this credit note.` : "The invoice hasn't been paid beyond this credit, so there's nothing to refund. The credit already reduced what's owed." });
        }
        invoiceToRefresh = cn.invoiceId;
      }
      await assertOpenPeriod(tx, organizationId, v.refundDate, "refundDate");
      const n = await allocateDocumentNumber(tx, organizationId, { documentType: "refund", date: new Date(`${v.refundDate}T00:00:00Z`) });
      const [row] = await tx
        .insert(refunds)
        .values({ organizationId, ...v, number: n.number, idempotencyKey, createdBy: userId, updatedBy: userId })
        .returning();
      await refreshInvoiceStatus(tx, organizationId, invoiceToRefresh);
      const [cust] = await tx.select({ name: customers.name }).from(customers).where(and(eq(customers.organizationId, organizationId), eq(customers.id, v.customerId)));
      await postRefund(tx, organizationId, { id: row.id, number: row.number, date: row.refundDate, amountPaise: row.amountPaise, method: row.method, customerId: v.customerId, customerName: cust?.name ?? "" }, { userId });
      return { ...row, replayed: false };
    });
  } catch (e) {
    if (isUnique(e, "refunds_idempotency_uq")) {
      const again = await existing();
      if (again) return again;
    }
    throw e;
  }
}

export async function voidRefund(organizationId: string, userId: string, id: string, reason: string) {
  return withTenant(organizationId, async (tx) => {
    const [r] = await tx.select().from(refunds).where(and(eq(refunds.organizationId, organizationId), eq(refunds.id, id))).for("update");
    if (!r) notFound("refund");
    if (r.status === "void") conflict("ALREADY_VOID", "This refund is already void.");
    const [updated] = await tx
      .update(refunds)
      .set({ status: "void", voidedAt: new Date(), voidReason: reason, updatedBy: userId })
      .where(and(eq(refunds.organizationId, organizationId), eq(refunds.id, id)))
      .returning();
    if (r.creditNoteId) {
      const [cn] = await tx.select({ invoiceId: creditNotes.invoiceId }).from(creditNotes).where(and(eq(creditNotes.organizationId, organizationId), eq(creditNotes.id, r.creditNoteId)));
      await refreshInvoiceStatus(tx, organizationId, cn?.invoiceId);
    }
    await reverseSource(tx, organizationId, "refund", id, todayInIndia(), `Void refund ${r.number ?? ""}: ${reason}`, userId);
    return updated;
  });
}

export async function listRefunds(organizationId: string, q: ListQuery & { customerId: string | null }) {
  return withTenant(organizationId, async (tx) => {
    const filter = and(
      eq(refunds.organizationId, organizationId),
      q.status === "archived" ? eq(refunds.status, "void") : q.status === "active" ? eq(refunds.status, "recorded") : undefined,
      q.customerId ? eq(refunds.customerId, q.customerId) : undefined,
      searchFilter(q.q, [refunds.number, refunds.reference, customers.name]),
    );
    const join = and(eq(customers.organizationId, refunds.organizationId), eq(customers.id, refunds.customerId));
    const [{ n: total }] = await tx.select({ n: count() }).from(refunds).innerJoin(customers, join).where(filter);
    const rows = await tx
      .select({
        id: refunds.id,
        number: refunds.number,
        status: refunds.status,
        refundDate: refunds.refundDate,
        amountPaise: refunds.amountPaise,
        method: refunds.method,
        reference: refunds.reference,
        customerId: refunds.customerId,
        customerName: customers.name,
        paymentId: refunds.paymentId,
        paymentNumber: sql<string | null>`(select p.number from business_payments p where p.organization_id = ${organizationId} and p.id = "refunds"."payment_id")`,
        creditNoteId: refunds.creditNoteId,
        creditNoteNumber: sql<string | null>`(select c.number from credit_notes c where c.organization_id = ${organizationId} and c.id = "refunds"."credit_note_id")`,
        voidReason: refunds.voidReason,
      })
      .from(refunds)
      .innerJoin(customers, join)
      .where(filter)
      .orderBy(desc(refunds.refundDate), desc(refunds.createdAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    return paged(rows, total, q);
  });
}

/* ---------------- Customer account and outstanding ---------------- */

export type LedgerEntry = {
  date: string;
  kind: "opening" | "invoice" | "debit_note" | "credit_note" | "payment" | "refund";
  id: string | null;
  number: string | null;
  /** What the customer owes more (+) or less (−). */
  debitPaise: number;
  creditPaise: number;
  balancePaise: number;
};

/** Running statement of a customer's account, plus totals and unused credits. */
export async function customerAccount(organizationId: string, customerId: string) {
  return withTenant(organizationId, async (tx) => {
    const [c] = await tx
      .select({ id: customers.id, name: customers.name, openingBalancePaise: customers.openingBalancePaise, createdAt: customers.createdAt })
      .from(customers)
      .where(and(eq(customers.organizationId, organizationId), eq(customers.id, customerId)));
    if (!c) notFound("customer");

    const issued = ["issued", "partially_paid", "paid"];
    const inv = await tx
      .select({ id: businessInvoices.id, number: businessInvoices.number, date: businessInvoices.issueDate, total: businessInvoices.totalPaise, at: businessInvoices.issuedAt })
      .from(businessInvoices)
      .where(and(eq(businessInvoices.organizationId, organizationId), eq(businessInvoices.customerId, customerId), inArray(businessInvoices.status, issued)));
    const dn = await tx
      .select({ id: debitNotes.id, number: debitNotes.number, date: debitNotes.issueDate, total: debitNotes.totalPaise, at: debitNotes.issuedAt })
      .from(debitNotes)
      .where(and(eq(debitNotes.organizationId, organizationId), eq(debitNotes.customerId, customerId), eq(debitNotes.status, "issued")));
    const cn = await tx
      .select({ id: creditNotes.id, number: creditNotes.number, date: creditNotes.issueDate, total: creditNotes.totalPaise, at: creditNotes.issuedAt })
      .from(creditNotes)
      .where(and(eq(creditNotes.organizationId, organizationId), eq(creditNotes.customerId, customerId), eq(creditNotes.status, "issued")));
    const pay = await tx
      .select({ id: businessPayments.id, number: businessPayments.number, date: businessPayments.paymentDate, total: businessPayments.amountPaise, at: businessPayments.createdAt })
      .from(businessPayments)
      .where(and(eq(businessPayments.organizationId, organizationId), eq(businessPayments.customerId, customerId), eq(businessPayments.status, "recorded")));
    const ref = await tx
      .select({ id: refunds.id, number: refunds.number, date: refunds.refundDate, total: refunds.amountPaise, at: refunds.createdAt })
      .from(refunds)
      .where(and(eq(refunds.organizationId, organizationId), eq(refunds.customerId, customerId), eq(refunds.status, "recorded")));

    type Ev = { date: string; at: Date | null; kind: LedgerEntry["kind"]; id: string; number: string | null; debit: number; credit: number };
    const events: Ev[] = [
      ...inv.map((x) => ({ date: x.date, at: x.at, kind: "invoice" as const, id: x.id, number: x.number, debit: x.total, credit: 0 })),
      ...dn.map((x) => ({ date: x.date, at: x.at, kind: "debit_note" as const, id: x.id, number: x.number, debit: x.total, credit: 0 })),
      ...cn.map((x) => ({ date: x.date, at: x.at, kind: "credit_note" as const, id: x.id, number: x.number, debit: 0, credit: x.total })),
      ...pay.map((x) => ({ date: x.date, at: x.at, kind: "payment" as const, id: x.id, number: x.number, debit: 0, credit: x.total })),
      ...ref.map((x) => ({ date: x.date, at: x.at, kind: "refund" as const, id: x.id, number: x.number, debit: x.total, credit: 0 })),
    ].sort((a, b) => (a.date === b.date ? (a.at?.getTime() ?? 0) - (b.at?.getTime() ?? 0) : a.date < b.date ? -1 : 1));

    let balance = c.openingBalancePaise;
    const ledger: LedgerEntry[] = [];
    if (c.openingBalancePaise !== 0) {
      ledger.push({ date: (events[0]?.date ?? todayInIndia()), kind: "opening", id: null, number: null, debitPaise: Math.max(0, c.openingBalancePaise), creditPaise: Math.max(0, -c.openingBalancePaise), balancePaise: balance });
    }
    for (const e of events) {
      balance += e.debit - e.credit;
      ledger.push({ date: e.date, kind: e.kind, id: e.id, number: e.number, debitPaise: e.debit, creditPaise: e.credit, balancePaise: balance });
    }

    const open = await openInvoices(tx, organizationId, customerId);
    // Unused money: payment advances not allocated or refunded.
    const { rows: adv } = await tx.execute<{ n: string | number }>(sql`
      select coalesce(sum(p.amount_paise
        - coalesce((select sum(a.amount_paise) from payment_allocations a where a.organization_id = p.organization_id and a.payment_id = p.id), 0)
        - coalesce((select sum(r.amount_paise) from refunds r where r.organization_id = p.organization_id and r.payment_id = p.id and r.status = 'recorded'), 0)), 0) as n
      from business_payments p
      where p.organization_id = ${organizationId} and p.customer_id = ${customerId} and p.status = 'recorded' and p.direction = 'received'`);
    const sum = (xs: { total: number }[]) => xs.reduce((a, x) => a + x.total, 0);
    return {
      customerId: c.id,
      customerName: c.name,
      openingBalancePaise: c.openingBalancePaise,
      invoicedPaise: sum(inv) + sum(dn),
      creditedPaise: sum(cn),
      receivedPaise: sum(pay),
      refundedPaise: sum(ref),
      /** Positive: the customer owes you. Negative: you owe them (advance or credit). */
      outstandingPaise: balance,
      unallocatedAdvancePaise: Number(adv[0]?.n ?? 0),
      openInvoices: open.map((b) => ({ id: b.id, number: b.number, issueDate: b.issueDate, dueDate: b.dueDate, totalPaise: b.totalPaise + b.debitedPaise, balancePaise: b.balancePaise })),
      ledger,
    };
  });
}

/** Unpaid invoices and advances by customer, with ageing by due date. */
export async function outstandingReport(organizationId: string, today: string = todayInIndia()) {
  return withTenant(organizationId, async (tx) => {
    const open = await openInvoices(tx, organizationId, null);
    const names = await tx
      .select({ id: customers.id, name: customers.name })
      .from(customers)
      .where(and(eq(customers.organizationId, organizationId), isNotNull(customers.id)));
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
    const byCustomer = new Map<string, { customerId: string; customerName: string; invoices: number; totalPaise: number; overduePaise: number; ageing: ReturnType<typeof empty>; oldestDue: string | null }>();
    const totals = { invoices: 0, totalPaise: 0, overduePaise: 0, ageing: empty() };
    for (const b of open) {
      const due = b.dueDate ?? b.issueDate;
      const bucket = bucketOf(due);
      const row = byCustomer.get(b.customerId) ?? { customerId: b.customerId, customerName: nameOf.get(b.customerId) ?? "", invoices: 0, totalPaise: 0, overduePaise: 0, ageing: empty(), oldestDue: null };
      row.invoices += 1;
      row.totalPaise += b.balancePaise;
      row.ageing[bucket] += b.balancePaise;
      if (bucket !== "current") row.overduePaise += b.balancePaise;
      if (!row.oldestDue || due < row.oldestDue) row.oldestDue = due;
      byCustomer.set(b.customerId, row);
      totals.invoices += 1;
      totals.totalPaise += b.balancePaise;
      totals.ageing[bucket] += b.balancePaise;
      if (bucket !== "current") totals.overduePaise += b.balancePaise;
    }
    const customersOut = [...byCustomer.values()].sort((a, b) => b.overduePaise - a.overduePaise || b.totalPaise - a.totalPaise);
    return { today, totals, customers: customersOut };
  });
}

/** Open invoices for the payment form (with what each still owes). */
export async function invoicesToPay(organizationId: string, customerId: string) {
  return withTenant(organizationId, async (tx) => {
    const open = await openInvoices(tx, organizationId, customerId);
    return open.map((b) => ({ id: b.id, number: b.number, issueDate: b.issueDate, dueDate: b.dueDate, totalPaise: b.totalPaise + b.debitedPaise, balancePaise: b.balancePaise }));
  });
}

/** Credit notes of a customer that can still be refunded (over-credited invoices). */
export async function refundableCreditNotes(organizationId: string, customerId: string) {
  return withTenant(organizationId, async (tx) => {
    const notes = await tx
      .select({ id: creditNotes.id })
      .from(creditNotes)
      .where(and(eq(creditNotes.organizationId, organizationId), eq(creditNotes.customerId, customerId), eq(creditNotes.status, "issued")));
    const out: { id: string; number: string | null; refundablePaise: number }[] = [];
    for (const n of notes) {
      const { cn, refundable } = await creditNoteRefundable(tx, organizationId, n.id);
      if (refundable > 0) out.push({ id: cn.id, number: cn.number, refundablePaise: refundable });
    }
    return out;
  });
}
