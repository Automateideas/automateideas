import { and, eq, isNull, sql } from "drizzle-orm";

import { billingSettings, invoiceSequences } from "@/db/schema";

import {
  NUMBERED_DOCUMENTS,
  type NumberFormat,
  type NumberedDocument,
  financialYearOf,
  formatDocumentNumber,
  indiaDate,
  numberingFrom,
} from "./numbering-format";
import { invalid } from "./records";
import { type TenantTx, withTenant } from "./tenant-db";

// Document numbers come only from the database, inside the same transaction
// that saves the document:
// - One row per series (tenant, branch, document type, financial year).
// - A single INSERT … ON CONFLICT DO UPDATE takes the next number and bumps
//   the counter. The row lock makes concurrent requests queue, so no two get
//   the same number.
// - If the document's transaction rolls back, so does the counter: no gaps.
// - Each document table also has a unique (tenant, number) index as a last guard.

async function numberingContext(tx: TenantTx, organizationId: string) {
  const [s] = await tx
    .select({
      financialYearStartMonth: billingSettings.financialYearStartMonth,
      invoicePrefix: billingSettings.invoicePrefix,
      documentNumbering: billingSettings.documentNumbering,
    })
    .from(billingSettings)
    .where(eq(billingSettings.organizationId, organizationId));
  return {
    startMonth: s?.financialYearStartMonth ?? 4,
    formats: numberingFrom(s?.documentNumbering, s?.invoicePrefix),
  };
}

export type AllocatedNumber = { number: string; sequence: number; financialYear: string; format: NumberFormat };

/**
 * Takes the next number for a document. Call it inside the transaction that
 * inserts the document (withTenant), so a failed save returns the number.
 */
export async function allocateDocumentNumber(
  tx: TenantTx,
  organizationId: string,
  opts: { documentType: NumberedDocument; date?: Date; branchId?: string | null },
): Promise<AllocatedNumber> {
  const { startMonth, formats } = await numberingContext(tx, organizationId);
  const format = formats[opts.documentType];
  const financialYear = financialYearOf(opts.date ?? indiaDate(), startMonth);
  const branchId = opts.branchId ?? null;

  const { rows } = await tx.execute<{ n: string }>(sql`
    insert into invoice_sequences (organization_id, branch_id, document_type, financial_year, prefix, padding, next_number)
    values (${organizationId}, ${branchId}, ${opts.documentType}, ${financialYear}, ${format.prefix}, ${format.padding}, 2)
    on conflict on constraint invoice_sequences_series_uq
    do update set next_number = invoice_sequences.next_number + 1,
                  prefix = excluded.prefix,
                  padding = excluded.padding,
                  updated_at = now()
    returning next_number - 1 as n`);
  const sequence = Number(rows[0].n);
  return { number: formatDocumentNumber(format, financialYear, sequence), sequence, financialYear, format };
}

/** What the next number of each document type will look like (nothing is taken). */
export async function previewNextNumbers(organizationId: string, at: Date = indiaDate()) {
  return withTenant(organizationId, async (tx) => {
    const { startMonth, formats } = await numberingContext(tx, organizationId);
    const financialYear = financialYearOf(at, startMonth);
    const rows = await tx
      .select({ documentType: invoiceSequences.documentType, nextNumber: invoiceSequences.nextNumber })
      .from(invoiceSequences)
      .where(
        and(
          eq(invoiceSequences.organizationId, organizationId),
          eq(invoiceSequences.financialYear, financialYear),
          isNull(invoiceSequences.branchId),
        ),
      );
    const next = new Map(rows.map((r) => [r.documentType, r.nextNumber]));
    return {
      financialYear,
      documents: NUMBERED_DOCUMENTS.map((d) => {
        const n = next.get(d.type) ?? 1;
        return {
          type: d.type,
          label: d.label,
          format: formats[d.type],
          nextNumber: n,
          // Numbers below this are taken (or reserved) in this financial year.
          used: n > 1,
          preview: formatDocumentNumber(formats[d.type], financialYear, n),
        };
      }),
    };
  });
}

/**
 * Starts this financial year's series at `nextNumber`, e.g. to continue from
 * numbers issued in another system. It can only move forward, so a number
 * can never be handed out twice.
 */
export async function setNextNumber(organizationId: string, userId: string, documentType: NumberedDocument, nextNumber: number, at: Date = indiaDate()) {
  return withTenant(organizationId, async (tx) => {
    const { startMonth, formats } = await numberingContext(tx, organizationId);
    const financialYear = financialYearOf(at, startMonth);
    const format = formats[documentType];
    // Lock the series row (if any) so a concurrent invoice can't slip in between.
    const { rows } = await tx.execute<{ next_number: string }>(sql`
      select next_number from invoice_sequences
      where organization_id = ${organizationId} and branch_id is null
        and document_type = ${documentType} and financial_year = ${financialYear}
      for update`);
    const current = rows[0] ? Number(rows[0].next_number) : 1;
    if (nextNumber < current) {
      invalid({ nextNumber: `Numbers up to ${current - 1} are already used this year. Choose ${current} or more.` });
    }
    await tx
      .insert(invoiceSequences)
      .values({ organizationId, branchId: null, documentType, financialYear, prefix: format.prefix, padding: format.padding, nextNumber, createdBy: userId, updatedBy: userId })
      .onConflictDoUpdate({
        target: [invoiceSequences.organizationId, invoiceSequences.branchId, invoiceSequences.documentType, invoiceSequences.financialYear],
        set: { nextNumber, updatedBy: userId, updatedAt: new Date() },
      });
    return { documentType, financialYear, nextNumber, preview: formatDocumentNumber(format, financialYear, nextNumber) };
  });
}
