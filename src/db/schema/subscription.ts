import { bigint, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { organization } from "./auth";

// One row per PayU seat checkout, written by the PayU webhook. Retried
// webhooks update the same row (unique txnid). Feeds /subscription/payments,
// /history and /invoices. Never holds card or bank details.
export const subscriptionPayment = pgTable(
  "subscription_payment",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      // Financial record: deleting the organization must not delete it.
      .references(() => organization.id, { onDelete: "restrict" }),
    provider: text("provider").default("payu").notNull(),
    // Our transaction id sent to PayU (unique per checkout).
    txnid: text("txnid").notNull().unique(),
    // PayU's payment id; for a successful mandate it becomes subscription_id.
    providerPaymentId: text("provider_payment_id"),
    // PayU status as sent: "success", "failure", "pending", ...
    status: text("status").notNull(),
    seats: integer("seats").notNull(),
    // Plan and billing cycle bought (null on payments recorded before plans existed).
    planId: text("plan_id"),
    billingCycle: text("billing_cycle"),
    // Amount in paise, so money is never a floating-point number.
    amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
    currency: text("currency").default("INR").notNull(),
    description: text("description"),
    paymentMode: text("payment_mode"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("subscription_payment_org_created_idx").on(table.organizationId, table.createdAt)],
);
