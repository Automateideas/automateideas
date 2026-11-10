import { and, count, eq, ne } from "drizzle-orm";
import { APIError } from "better-auth/api";

import { db } from "@/db";
import { businessInvoices, creditNotes, debitNotes, subscriptionPayment } from "@/db/schema";

// Financial records must survive organization deletion. Three layers:
// 1. The HTTP endpoint that deletes organizations is disabled (lib/auth.ts).
// 2. beforeDeleteOrganization calls assertOrgDeletable, so server-side
//    deletions are refused while records exist.
// 3. Financial tables reference organization with ON DELETE RESTRICT, so the
//    database itself refuses (checked by src/db/schema/financial.test.ts).
// When adding a financial table (invoices, payments, purchases...), count it here too.

export async function countFinancialRecords(organizationId: string) {
  // Issued (non-draft) sales documents count; drafts aren't records yet.
  const issued = <T extends typeof businessInvoices | typeof creditNotes | typeof debitNotes>(t: T) =>
    db.select({ n: count() }).from(t).where(and(eq(t.organizationId, organizationId), ne(t.status, "draft")));
  const [[payments], [invoices], [credits], [debits]] = await Promise.all([
    db.select({ n: count() }).from(subscriptionPayment).where(eq(subscriptionPayment.organizationId, organizationId)),
    issued(businessInvoices),
    issued(creditNotes),
    issued(debitNotes),
  ]);
  return { subscriptionPayments: payments.n, invoices: invoices.n, creditNotes: credits.n, debitNotes: debits.n };
}

/** Throws a 409 when the organization still has financial records. */
export async function assertOrgDeletable(organizationId: string) {
  const counts = await countFinancialRecords(organizationId);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total > 0) {
    throw new APIError("CONFLICT", {
      code: "ORGANIZATION_HAS_FINANCIAL_RECORDS",
      message: "This organization has financial records, so it can't be deleted. Contact support.",
    });
  }
}
