import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { subscriptionPayment } from "@/db/schema";

import { isBillingCycle, isPlanId } from "./plans";

/** "700.00" → 70000. Parses the decimal string, so no floating-point rounding. */
export function amountToPaise(amount: string): number | null {
  const m = /^\s*(\d+)(?:\.(\d{1,2}))?\s*$/.exec(amount);
  if (!m) return null;
  return Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
}

export type PaymentRecord = {
  organizationId: string;
  txnid: string;
  providerPaymentId: string | null;
  status: string;
  seats: number;
  planId: string | null;
  billingCycle: string | null;
  amountPaise: number;
  description: string | null;
  paymentMode: string | null;
  errorMessage: string | null;
};

/**
 * The record to keep for a verified PayU webhook from a seat checkout, or
 * null when it's missing what we need. Keeps no card or bank details.
 */
export function paymentFromPayu(p: Record<string, string>, organizationId: string, seats: number): PaymentRecord | null {
  const amountPaise = amountToPaise(p.amount ?? "");
  if (!p.txnid || !p.status || amountPaise === null) return null;
  const error = p.error_Message || p.error || "";
  return {
    organizationId,
    txnid: p.txnid,
    providerPaymentId: p.mihpayid || null,
    status: p.status.toLowerCase(),
    seats,
    // Older checkouts carried no plan or cycle.
    planId: isPlanId(p.udf4) ? p.udf4 : null,
    billingCycle: isBillingCycle(p.udf5) ? p.udf5 : null,
    amountPaise,
    description: p.productinfo || null,
    paymentMode: p.mode || null,
    // PayU sends "E000" / "No Error" on success.
    errorMessage: p.status === "success" || !error || /^(E000|no error)$/i.test(error) ? null : error,
  };
}

/** Saves the payment; a retried webhook for the same txnid updates the row. */
export async function recordPayment(
  record: PaymentRecord,
  tx: Pick<typeof db, "insert"> = db,
) {
  await tx
    .insert(subscriptionPayment)
    .values({ id: randomUUID(), provider: "payu", ...record })
    .onConflictDoUpdate({
      target: subscriptionPayment.txnid,
      set: {
        status: record.status,
        providerPaymentId: record.providerPaymentId,
        paymentMode: record.paymentMode,
        errorMessage: record.errorMessage,
        updatedAt: new Date(),
      },
    });
}

export async function listPayments(organizationId: string) {
  return db
    .select({
      id: subscriptionPayment.id,
      txnid: subscriptionPayment.txnid,
      providerPaymentId: subscriptionPayment.providerPaymentId,
      status: subscriptionPayment.status,
      seats: subscriptionPayment.seats,
      planId: subscriptionPayment.planId,
      billingCycle: subscriptionPayment.billingCycle,
      amountPaise: subscriptionPayment.amountPaise,
      currency: subscriptionPayment.currency,
      description: subscriptionPayment.description,
      paymentMode: subscriptionPayment.paymentMode,
      errorMessage: subscriptionPayment.errorMessage,
      createdAt: subscriptionPayment.createdAt,
      updatedAt: subscriptionPayment.updatedAt,
    })
    .from(subscriptionPayment)
    .where(eq(subscriptionPayment.organizationId, organizationId))
    .orderBy(desc(subscriptionPayment.createdAt))
    .limit(200);
}
