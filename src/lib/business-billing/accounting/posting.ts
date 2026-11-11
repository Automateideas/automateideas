import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { accounts, billingSettings, journalEntries, journalLines } from "@/db/schema";

import { allocateDocumentNumber } from "../numbering";
import { conflict, invalid } from "../records";
import type { TenantTx } from "../tenant-db";
import { SYSTEM_ACCOUNTS, type SystemAccountKey, cashAccountFor } from "./chart";

// Automatic double-entry posting. Every function here runs inside the
// caller's transaction (the one that issues the document or records the
// payment), so a business event and its journal entry are saved together or
// not at all. The database (drizzle/*_journal_rules) rejects any entry whose
// debits and credits differ, and any change to a posted entry.

export type PostingLine = {
  account: SystemAccountKey | { id: string };
  debit?: number;
  credit?: number;
  customerId?: string | null;
  supplierId?: string | null;
  description?: string | null;
};

export type Posting = {
  date: string;
  narration: string;
  sourceType: string;
  sourceId: string | null;
  lines: PostingLine[];
  reversesEntryId?: string | null;
  userId?: string | null;
  /** Backfilling history may post into a locked period. */
  ignoreLock?: boolean;
  /** Manual entries: makes a retried submit return the first entry instead of posting twice. */
  idempotencyKey?: string | null;
};

/** The company's system accounts by key, creating any that are missing (first use). */
export async function ensureChart(tx: TenantTx, organizationId: string): Promise<Record<SystemAccountKey, string>> {
  const existing = await tx
    .select({ id: accounts.id, key: accounts.systemKey })
    .from(accounts)
    .where(and(eq(accounts.organizationId, organizationId), inArray(accounts.systemKey, SYSTEM_ACCOUNTS.map((a) => a.key))));
  if (existing.length < SYSTEM_ACCOUNTS.length) {
    const have = new Set(existing.map((e) => e.key));
    const missing = SYSTEM_ACCOUNTS.filter((a) => !have.has(a.key));
    // A custom account may already use one of the standard codes; use a free code then.
    const usedCodes = new Set((await tx.select({ code: accounts.code }).from(accounts).where(eq(accounts.organizationId, organizationId))).map((r) => r.code));
    await tx
      .insert(accounts)
      .values(
        missing.map((a) => {
          let code: string = a.code;
          for (let n = 1; usedCodes.has(code); n++) code = `${a.code}-${n}`;
          usedCodes.add(code);
          return { organizationId, code, name: a.name, type: a.type, isSystem: true, systemKey: a.key };
        }),
      )
      .onConflictDoNothing();
    return ensureChart(tx, organizationId);
  }
  return Object.fromEntries(existing.map((e) => [e.key, e.id])) as Record<SystemAccountKey, string>;
}

export async function booksLockedUntil(tx: TenantTx, organizationId: string): Promise<string | null> {
  const [s] = await tx.select({ d: billingSettings.booksLockedUntil }).from(billingSettings).where(eq(billingSettings.organizationId, organizationId));
  return s?.d ?? null;
}

/** Refuses dates inside the closed period. */
export async function assertOpenPeriod(tx: TenantTx, organizationId: string, date: string, field = "date") {
  const locked = await booksLockedUntil(tx, organizationId);
  if (locked && date <= locked) {
    invalid({ [field]: `Your books are closed up to ${locked}. Use a later date, or reopen the period in Accounting settings.` }, "That date is in a closed period.");
  }
}

/** Posts one balanced entry and returns its id. Zero-amount lines are dropped. */
export async function postEntry(tx: TenantTx, organizationId: string, p: Posting): Promise<string> {
  const lines = p.lines.filter((l) => (l.debit ?? 0) > 0 || (l.credit ?? 0) > 0);
  for (const l of lines) {
    if ((l.debit ?? 0) < 0 || (l.credit ?? 0) < 0 || ((l.debit ?? 0) > 0 && (l.credit ?? 0) > 0)) throw new Error("A journal line must be a debit or a credit, not both.");
  }
  const dr = lines.reduce((a, l) => a + (l.debit ?? 0), 0);
  const cr = lines.reduce((a, l) => a + (l.credit ?? 0), 0);
  if (lines.length < 2 || dr !== cr) {
    // Programming error in a posting rule: refuse loudly (the database would too).
    throw new Error(`Unbalanced posting for ${p.sourceType} ${p.sourceId}: debits ${dr}, credits ${cr}.`);
  }
  if (!p.ignoreLock) await assertOpenPeriod(tx, organizationId, p.date);
  const chart = await ensureChart(tx, organizationId);
  const n = await allocateDocumentNumber(tx, organizationId, { documentType: "journal_entry", date: new Date(`${p.date}T00:00:00Z`) });
  const [entry] = await tx
    .insert(journalEntries)
    .values({
      organizationId,
      number: n.number,
      entryDate: p.date,
      narration: p.narration,
      sourceType: p.sourceType,
      sourceId: p.sourceId,
      postedAt: new Date(),
      reversesEntryId: p.reversesEntryId ?? null,
      idempotencyKey: p.idempotencyKey ?? null,
      createdBy: p.userId ?? null,
      updatedBy: p.userId ?? null,
    })
    .returning({ id: journalEntries.id });
  await tx.insert(journalLines).values(
    lines.map((l, i) => ({
      organizationId,
      entryId: entry.id,
      lineNo: i + 1,
      accountId: typeof l.account === "string" ? chart[l.account] : l.account.id,
      customerId: l.customerId ?? null,
      supplierId: l.supplierId ?? null,
      debitPaise: l.debit ?? 0,
      creditPaise: l.credit ?? 0,
      description: l.description ?? null,
      createdBy: p.userId ?? null,
      updatedBy: p.userId ?? null,
    })),
  );
  return entry.id;
}

/** Reverses the original posting of a source (swaps debits and credits), dated `date`. */
export async function reverseSource(tx: TenantTx, organizationId: string, sourceType: string, sourceId: string, date: string, narration: string, userId?: string | null) {
  const [original] = await tx
    .select({ id: journalEntries.id, number: journalEntries.number })
    .from(journalEntries)
    .where(and(eq(journalEntries.organizationId, organizationId), eq(journalEntries.sourceType, sourceType), eq(journalEntries.sourceId, sourceId), isNull(journalEntries.reversesEntryId)));
  if (!original) return null; // nothing was posted (e.g. created before accounting existed and not yet backfilled)
  return reverseEntry(tx, organizationId, original.id, date, narration, userId);
}

/** Posts the mirror image of an entry. Each entry can be reversed once. */
export async function reverseEntry(tx: TenantTx, organizationId: string, entryId: string, date: string, narration: string, userId?: string | null, ignoreLock = false) {
  const [entry] = await tx.select().from(journalEntries).where(and(eq(journalEntries.organizationId, organizationId), eq(journalEntries.id, entryId)));
  if (!entry) invalid({ entryId: "This journal entry doesn't exist." });
  if (entry.reversesEntryId) conflict("IS_REVERSAL", "This entry is itself a reversal.");
  const [already] = await tx.select({ id: journalEntries.id }).from(journalEntries).where(and(eq(journalEntries.organizationId, organizationId), eq(journalEntries.reversesEntryId, entryId)));
  if (already) conflict("ALREADY_REVERSED", "This entry has already been reversed.");
  const lines = await tx.select().from(journalLines).where(and(eq(journalLines.organizationId, organizationId), eq(journalLines.entryId, entryId)));
  return postEntry(tx, organizationId, {
    date,
    narration,
    sourceType: entry.sourceType,
    sourceId: entry.sourceId,
    reversesEntryId: entry.id,
    userId,
    ignoreLock,
    lines: lines.map((l) => ({ account: { id: l.accountId }, debit: l.creditPaise, credit: l.debitPaise, customerId: l.customerId, supplierId: l.supplierId, description: l.description })),
  });
}

/* ---------------- Posting rules ---------------- */

export type PostableDocument = {
  id: string;
  number: string | null;
  issueDate: string;
  partyId: string;
  partyName: string | null;
  reverseCharge: boolean;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  cessPaise: number;
  roundOffPaise: number;
  totalPaise: number;
};

export const POSTED_DOCUMENTS = ["invoices", "credit-notes", "debit-notes", "purchase-bills", "purchase-returns"] as const;
export type PostedDocument = (typeof POSTED_DOCUMENTS)[number];
export const isPostedDocument = (slug: string): slug is PostedDocument => (POSTED_DOCUMENTS as readonly string[]).includes(slug);

/**
 * The lines for a document, "forward" (invoice, debit note, purchase bill) or
 * mirrored (credit note, purchase return).
 *
 *   Sale:     Dr Debtors total  = Cr Sales taxable + Cr Output GST + round-off
 *   Purchase: Dr Purchases taxable + Dr Input GST + round-off = Cr Creditors total (+ Cr RCM payable)
 *
 * Reverse charge: a sale's total excludes GST (the buyer pays it), so no
 * output GST; a purchase books input GST against "GST payable under reverse charge".
 */
function documentLines(slug: PostedDocument, d: PostableDocument): PostingLine[] {
  const sale = slug === "invoices" || slug === "credit-notes" || slug === "debit-notes";
  const mirrored = slug === "credit-notes" || slug === "purchase-returns";
  const taxes = { cgst: d.cgstPaise, sgst: d.sgstPaise, igst: d.igstPaise, cess: d.cessPaise };
  const tax = d.cgstPaise + d.sgstPaise + d.igstPaise + d.cessPaise;
  const out: PostingLine[] = [];
  const desc = `${d.number ?? ""} ${d.partyName ?? ""}`.trim();
  if (sale) {
    out.push({ account: "receivables", debit: d.totalPaise, customerId: d.partyId, description: desc });
    out.push({ account: mirrored ? "sales_returns" : "sales", credit: d.taxablePaise });
    if (!d.reverseCharge) {
      for (const [k, v] of Object.entries(taxes)) out.push({ account: `output_${k}` as SystemAccountKey, credit: v });
    }
    if (d.roundOffPaise > 0) out.push({ account: "round_off", credit: d.roundOffPaise });
    if (d.roundOffPaise < 0) out.push({ account: "round_off", debit: -d.roundOffPaise });
  } else {
    out.push({ account: "payables", credit: d.totalPaise, supplierId: d.partyId, description: desc });
    out.push({ account: mirrored ? "purchase_returns" : "purchases", debit: d.taxablePaise });
    for (const [k, v] of Object.entries(taxes)) out.push({ account: `input_${k}` as SystemAccountKey, debit: v });
    if (d.reverseCharge && tax > 0) out.push({ account: "rcm_payable", credit: tax });
    if (d.roundOffPaise > 0) out.push({ account: "round_off", debit: d.roundOffPaise });
    if (d.roundOffPaise < 0) out.push({ account: "round_off", credit: -d.roundOffPaise });
  }
  // Credit notes and purchase returns are the mirror image (except the
  // return accounts, which already sit on the right side for a mirror).
  return mirrored ? out.map((l) => ({ ...l, debit: l.credit, credit: l.debit })) : out;
}

export const documentSource = (slug: PostedDocument) => `document:${slug}`;

const NARRATION: Record<PostedDocument, string> = {
  invoices: "Sales invoice",
  "credit-notes": "Credit note",
  "debit-notes": "Debit note",
  "purchase-bills": "Purchase bill",
  "purchase-returns": "Purchase return",
};

export async function postDocument(tx: TenantTx, organizationId: string, slug: PostedDocument, d: PostableDocument, opts: { userId?: string | null; ignoreLock?: boolean } = {}) {
  return postEntry(tx, organizationId, {
    date: d.issueDate,
    narration: `${NARRATION[slug]} ${d.number ?? ""} — ${d.partyName ?? ""}`.trim(),
    sourceType: documentSource(slug),
    sourceId: d.id,
    lines: documentLines(slug, d),
    ...opts,
  });
}

export type PostablePayment = {
  id: string;
  number: string | null;
  direction: "received" | "made";
  date: string;
  amountPaise: number;
  method: string;
  partyId: string;
  partyName: string;
};

/** Received: Dr Cash/Bank, Cr Debtors. Made: Dr Creditors, Cr Cash/Bank. */
export async function postPayment(tx: TenantTx, organizationId: string, p: PostablePayment, opts: { userId?: string | null; ignoreLock?: boolean } = {}) {
  const money = cashAccountFor(p.method);
  const lines: PostingLine[] =
    p.direction === "received"
      ? [
          { account: money, debit: p.amountPaise },
          { account: "receivables", credit: p.amountPaise, customerId: p.partyId, description: p.number },
        ]
      : [
          { account: "payables", debit: p.amountPaise, supplierId: p.partyId, description: p.number },
          { account: money, credit: p.amountPaise },
        ];
  return postEntry(tx, organizationId, {
    date: p.date,
    narration: `${p.direction === "received" ? "Payment received" : "Payment to supplier"} ${p.number ?? ""} — ${p.partyName}`,
    sourceType: p.direction === "received" ? "payment_received" : "payment_made",
    sourceId: p.id,
    lines,
    ...opts,
  });
}

/** Refund to a customer: Dr Debtors, Cr Cash/Bank. */
export async function postRefund(tx: TenantTx, organizationId: string, r: { id: string; number: string | null; date: string; amountPaise: number; method: string; customerId: string; customerName: string }, opts: { userId?: string | null; ignoreLock?: boolean } = {}) {
  return postEntry(tx, organizationId, {
    date: r.date,
    narration: `Refund ${r.number ?? ""} — ${r.customerName}`,
    sourceType: "refund",
    sourceId: r.id,
    lines: [
      { account: "receivables", debit: r.amountPaise, customerId: r.customerId, description: r.number },
      { account: cashAccountFor(r.method), credit: r.amountPaise },
    ],
    ...opts,
  });
}

/**
 * Keeps a customer's or supplier's opening balance in the books: posts the
 * difference between their opening balance and what's already been posted
 * for it, against "Opening balance equity".
 */
export async function syncOpeningBalance(tx: TenantTx, organizationId: string, party: { kind: "customer" | "supplier"; id: string; name: string; openingBalancePaise: number }, date: string, userId?: string | null) {
  const chart = await ensureChart(tx, organizationId);
  const account = party.kind === "customer" ? chart.receivables : chart.payables;
  const partyCol = party.kind === "customer" ? journalLines.customerId : journalLines.supplierId;
  const [{ net }] = await tx
    .select({ net: sql<number>`coalesce(sum(${journalLines.debitPaise} - ${journalLines.creditPaise}), 0)`.mapWith(Number) })
    .from(journalLines)
    .innerJoin(journalEntries, and(eq(journalEntries.organizationId, journalLines.organizationId), eq(journalEntries.id, journalLines.entryId)))
    .where(and(eq(journalLines.organizationId, organizationId), eq(journalLines.accountId, account), eq(partyCol, party.id), eq(journalEntries.sourceType, "opening")));
  // Customers owe you (debit balance); you owe suppliers (credit balance).
  const target = party.kind === "customer" ? party.openingBalancePaise : -party.openingBalancePaise;
  const delta = target - net;
  if (delta === 0) return null;
  const partyLine: PostingLine = {
    account: party.kind === "customer" ? "receivables" : "payables",
    debit: delta > 0 ? delta : 0,
    credit: delta < 0 ? -delta : 0,
    [party.kind === "customer" ? "customerId" : "supplierId"]: party.id,
    description: "Opening balance",
  };
  return postEntry(tx, organizationId, {
    date,
    narration: `Opening balance — ${party.name}`,
    sourceType: "opening",
    sourceId: party.id,
    userId,
    // Opening balances describe the past; they aren't blocked by a closed period.
    ignoreLock: true,
    lines: [partyLine, { account: "opening_equity", debit: delta < 0 ? -delta : 0, credit: delta > 0 ? delta : 0 }],
  });
}
