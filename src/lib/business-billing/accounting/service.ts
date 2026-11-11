import { type SQL, and, asc, count, desc, eq, gte, ilike, inArray, isNull, lte, or, sql } from "drizzle-orm";

import { accounts, billingSettings, customers, journalEntries, journalLines, suppliers } from "@/db/schema";

import { todayInIndia } from "../documents/types";
import { conflict, guardUnique, invalid, notFound, uniqueViolation } from "../records";
import { type TenantTx, withTenant } from "../tenant-db";
import { type AccountType, isDebitNormal, normalBalance } from "./chart";
import {
  POSTED_DOCUMENTS,
  type PostedDocument,
  booksLockedUntil,
  documentSource,
  ensureChart,
  postDocument,
  postEntry,
  postPayment,
  postRefund,
  reverseEntry,
  syncOpeningBalance,
} from "./posting";
import { type AccountValues, type JournalValues, financialYearRange } from "./validation";

// The books: chart of accounts, journal, ledgers and the three statements.
// Everything is computed from journal_lines; nothing here stores a balance.
// Writes (accounts, manual entries, closing the books) need
// billing.accounting.manage; reads need billing.reports.view.

/* ---------------- Shared ---------------- */

async function startMonth(tx: TenantTx, organizationId: string) {
  const [s] = await tx.select({ m: billingSettings.financialYearStartMonth }).from(billingSettings).where(eq(billingSettings.organizationId, organizationId));
  return s?.m ?? 4;
}

type Totals = { id: string; code: string; name: string; type: AccountType; isSystem: boolean; systemKey: string | null; parentId: string | null; archivedAt: Date | null; debitPaise: number; creditPaise: number };

/** Every account with its debit and credit totals for entries dated in [from, to]. */
async function accountTotals(tx: TenantTx, organizationId: string, range: { from?: string | null; to?: string | null }): Promise<Totals[]> {
  const inRange = and(
    eq(journalEntries.organizationId, journalLines.organizationId),
    eq(journalEntries.id, journalLines.entryId),
    range.from ? gte(journalEntries.entryDate, range.from) : undefined,
    range.to ? lte(journalEntries.entryDate, range.to) : undefined,
  );
  const rows = await tx
    .select({
      id: accounts.id,
      code: accounts.code,
      name: accounts.name,
      type: accounts.type,
      isSystem: accounts.isSystem,
      systemKey: accounts.systemKey,
      parentId: accounts.parentId,
      archivedAt: accounts.archivedAt,
      debitPaise: sql<number>`coalesce(sum(${journalLines.debitPaise}) filter (where ${journalEntries.id} is not null), 0)`.mapWith(Number),
      creditPaise: sql<number>`coalesce(sum(${journalLines.creditPaise}) filter (where ${journalEntries.id} is not null), 0)`.mapWith(Number),
    })
    .from(accounts)
    .leftJoin(journalLines, and(eq(journalLines.organizationId, accounts.organizationId), eq(journalLines.accountId, accounts.id)))
    .leftJoin(journalEntries, inRange)
    .where(eq(accounts.organizationId, organizationId))
    .groupBy(accounts.id)
    .orderBy(asc(accounts.code));
  return rows as Totals[];
}

const accountRow = (t: Totals) => ({
  id: t.id,
  code: t.code,
  name: t.name,
  type: t.type,
  isSystem: t.isSystem,
  systemKey: t.systemKey,
  parentId: t.parentId,
  archived: t.archivedAt !== null,
  debitPaise: t.debitPaise,
  creditPaise: t.creditPaise,
  balancePaise: normalBalance(t.type, t.debitPaise, t.creditPaise),
});

/* ---------------- Chart of accounts ---------------- */

export async function listAccounts(organizationId: string) {
  return withTenant(organizationId, async (tx) => {
    await ensureChart(tx, organizationId);
    const totals = await accountTotals(tx, organizationId, { to: todayInIndia() });
    const [{ n }] = await tx.select({ n: count() }).from(journalLines).where(eq(journalLines.organizationId, organizationId));
    const used = new Set(
      (await tx.selectDistinct({ id: journalLines.accountId }).from(journalLines).where(eq(journalLines.organizationId, organizationId))).map((r) => r.id),
    );
    return {
      accounts: totals.map((t) => ({ ...accountRow(t), used: used.has(t.id) })),
      hasEntries: n > 0,
      booksLockedUntil: await booksLockedUntil(tx, organizationId),
    };
  });
}

const ACCOUNT_UNIQUE = { accounts_code_uq: ["code", "Another account already uses this code."] } as const;

async function readAccount(tx: TenantTx, organizationId: string, id: string) {
  const [a] = await tx.select().from(accounts).where(and(eq(accounts.organizationId, organizationId), eq(accounts.id, id)));
  if (!a) notFound("account");
  return a;
}

async function checkParent(tx: TenantTx, organizationId: string, v: AccountValues, selfId?: string) {
  if (!v.parentId) return;
  if (v.parentId === selfId) invalid({ parentId: "An account can't be its own parent." });
  const [p] = await tx.select().from(accounts).where(and(eq(accounts.organizationId, organizationId), eq(accounts.id, v.parentId)));
  if (!p) invalid({ parentId: "Choose a parent account from the list." });
  if (p.type !== v.type) invalid({ parentId: "A parent account must be of the same type." });
  if (p.parentId) invalid({ parentId: "Choose a top-level account as the parent (one level of grouping)." });
}

export async function createAccount(organizationId: string, userId: string, v: AccountValues) {
  return guardUnique(
    () =>
      withTenant(organizationId, async (tx) => {
        await ensureChart(tx, organizationId);
        await checkParent(tx, organizationId, v);
        const [row] = await tx
          .insert(accounts)
          .values({ organizationId, code: v.code, name: v.name, type: v.type, parentId: v.parentId, createdBy: userId, updatedBy: userId })
          .returning();
        return row;
      }),
    ACCOUNT_UNIQUE,
  );
}

/** Code and name can always change. Type only while nothing is posted to it, and never for system accounts. */
export async function updateAccount(organizationId: string, userId: string, id: string, v: AccountValues) {
  return guardUnique(
    () =>
      withTenant(organizationId, async (tx) => {
        const current = await readAccount(tx, organizationId, id);
        if (v.type !== current.type) {
          if (current.isSystem) invalid({ type: "This is a standard account; its type can't change." });
          const [used] = await tx.select({ id: journalLines.id }).from(journalLines).where(and(eq(journalLines.organizationId, organizationId), eq(journalLines.accountId, id))).limit(1);
          if (used) invalid({ type: "Entries are already posted to this account, so its type can't change." });
          const [child] = await tx.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.organizationId, organizationId), eq(accounts.parentId, id))).limit(1);
          if (child) invalid({ type: "Other accounts are grouped under this one; move them first." });
        }
        await checkParent(tx, organizationId, v, id);
        if (v.parentId) {
          const [child] = await tx.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.organizationId, organizationId), eq(accounts.parentId, id))).limit(1);
          if (child) invalid({ parentId: "Other accounts are grouped under this one, so it can't have a parent." });
        }
        const [row] = await tx
          .update(accounts)
          .set({ code: v.code, name: v.name, type: v.type, parentId: v.parentId, updatedBy: userId })
          .where(and(eq(accounts.organizationId, organizationId), eq(accounts.id, id)))
          .returning();
        return row;
      }),
    ACCOUNT_UNIQUE,
  );
}

/** System accounts can't be archived; others only with a zero balance. */
export async function setAccountArchived(organizationId: string, userId: string, id: string, archived: boolean) {
  return withTenant(organizationId, async (tx) => {
    const current = await readAccount(tx, organizationId, id);
    if (archived && current.isSystem) conflict("SYSTEM_ACCOUNT", "Standard accounts are used by automatic postings and can't be archived.");
    if (archived) {
      const [b] = await tx
        .select({ net: sql<number>`coalesce(sum(${journalLines.debitPaise} - ${journalLines.creditPaise}), 0)`.mapWith(Number) })
        .from(journalLines)
        .where(and(eq(journalLines.organizationId, organizationId), eq(journalLines.accountId, id)));
      if (b.net !== 0) conflict("HAS_BALANCE", "This account still has a balance. Move it to another account with a journal entry first.");
    }
    const [row] = await tx
      .update(accounts)
      .set({ archivedAt: archived ? (current.archivedAt ?? new Date()) : null, updatedBy: userId })
      .where(and(eq(accounts.organizationId, organizationId), eq(accounts.id, id)))
      .returning();
    return row;
  });
}

/* ---------------- Journal ---------------- */

export type JournalQuery = { page: number; pageSize: number; q: string | null; from: string | null; to: string | null; source: "all" | "manual" | "automatic" };

export async function listJournal(organizationId: string, q: JournalQuery) {
  return withTenant(organizationId, async (tx) => {
    const pattern = q.q ? `%${q.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
    const filter = and(
      eq(journalEntries.organizationId, organizationId),
      q.from ? gte(journalEntries.entryDate, q.from) : undefined,
      q.to ? lte(journalEntries.entryDate, q.to) : undefined,
      q.source === "manual" ? eq(journalEntries.sourceType, "manual") : q.source === "automatic" ? sql`${journalEntries.sourceType} <> 'manual'` : undefined,
      pattern ? or(ilike(journalEntries.number, pattern), ilike(journalEntries.narration, pattern)) : undefined,
    );
    const [{ total }] = await tx.select({ total: count() }).from(journalEntries).where(filter);
    const reversal = sql<string | null>`(select r.id from journal_entries r where r.organization_id = "journal_entries"."organization_id" and r.reverses_entry_id = "journal_entries"."id")`;
    const items = await tx
      .select({
        id: journalEntries.id,
        number: journalEntries.number,
        entryDate: journalEntries.entryDate,
        narration: journalEntries.narration,
        sourceType: journalEntries.sourceType,
        sourceId: journalEntries.sourceId,
        reversesEntryId: journalEntries.reversesEntryId,
        reversedById: reversal,
        amountPaise: sql<number>`(select coalesce(sum(l.debit_paise), 0) from journal_lines l where l.organization_id = "journal_entries"."organization_id" and l.entry_id = "journal_entries"."id")`.mapWith(Number),
      })
      .from(journalEntries)
      .where(filter)
      .orderBy(desc(journalEntries.entryDate), desc(journalEntries.createdAt), desc(journalEntries.id))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    return { items, total, page: q.page, pageSize: q.pageSize };
  });
}

async function readEntry(tx: TenantTx, organizationId: string, id: string) {
  const [e] = await tx.select().from(journalEntries).where(and(eq(journalEntries.organizationId, organizationId), eq(journalEntries.id, id)));
  if (!e) notFound("journal entry");
  const lines = await tx
    .select({
      lineNo: journalLines.lineNo,
      accountId: journalLines.accountId,
      accountCode: accounts.code,
      accountName: accounts.name,
      customerId: journalLines.customerId,
      customerName: customers.name,
      supplierId: journalLines.supplierId,
      supplierName: suppliers.name,
      debitPaise: journalLines.debitPaise,
      creditPaise: journalLines.creditPaise,
      description: journalLines.description,
    })
    .from(journalLines)
    .innerJoin(accounts, and(eq(accounts.organizationId, journalLines.organizationId), eq(accounts.id, journalLines.accountId)))
    .leftJoin(customers, and(eq(customers.organizationId, journalLines.organizationId), eq(customers.id, journalLines.customerId)))
    .leftJoin(suppliers, and(eq(suppliers.organizationId, journalLines.organizationId), eq(suppliers.id, journalLines.supplierId)))
    .where(and(eq(journalLines.organizationId, organizationId), eq(journalLines.entryId, id)))
    .orderBy(asc(journalLines.lineNo));
  const related = await tx
    .select({ id: journalEntries.id, number: journalEntries.number, entryDate: journalEntries.entryDate })
    .from(journalEntries)
    .where(and(eq(journalEntries.organizationId, organizationId), or(eq(journalEntries.reversesEntryId, id), e.reversesEntryId ? eq(journalEntries.id, e.reversesEntryId) : sql`false`)));
  return {
    id: e.id,
    number: e.number,
    entryDate: e.entryDate,
    narration: e.narration,
    sourceType: e.sourceType,
    sourceId: e.sourceId,
    postedAt: e.postedAt,
    createdAt: e.createdAt,
    reverses: related.find((r) => r.id === e.reversesEntryId) ?? null,
    reversedBy: related.find((r) => r.id !== e.reversesEntryId) ?? null,
    lines,
    totalPaise: lines.reduce((a, l) => a + l.debitPaise, 0),
  };
}

export type JournalEntryDetail = Awaited<ReturnType<typeof readEntry>>;

export const getJournalEntry = (organizationId: string, id: string) => withTenant(organizationId, (tx) => readEntry(tx, organizationId, id));

/** Checks that every account and party on a manual entry exists and is in use. */
async function checkJournalRefs(tx: TenantTx, organizationId: string, v: JournalValues) {
  const ids = [...new Set(v.lines.map((l) => l.accountId))];
  const found = await tx
    .select({ id: accounts.id, archivedAt: accounts.archivedAt })
    .from(accounts)
    .where(and(eq(accounts.organizationId, organizationId), inArray(accounts.id, ids)));
  const byId = new Map(found.map((a) => [a.id, a]));
  const customerIds = [...new Set(v.lines.flatMap((l) => (l.customerId ? [l.customerId] : [])))];
  const supplierIds = [...new Set(v.lines.flatMap((l) => (l.supplierId ? [l.supplierId] : [])))];
  const okCustomers = new Set(customerIds.length ? (await tx.select({ id: customers.id }).from(customers).where(and(eq(customers.organizationId, organizationId), inArray(customers.id, customerIds)))).map((c) => c.id) : []);
  const okSuppliers = new Set(supplierIds.length ? (await tx.select({ id: suppliers.id }).from(suppliers).where(and(eq(suppliers.organizationId, organizationId), inArray(suppliers.id, supplierIds)))).map((s) => s.id) : []);
  const errors: Record<string, string> = {};
  v.lines.forEach((l, i) => {
    const a = byId.get(l.accountId);
    if (!a) errors[`lines.${i}.accountId`] = "Choose an account from the list.";
    else if (a.archivedAt) errors[`lines.${i}.accountId`] = "This account is archived. Restore it or choose another.";
    if (l.customerId && !okCustomers.has(l.customerId)) errors[`lines.${i}.customerId`] = "Choose a customer from the list.";
    if (l.supplierId && !okSuppliers.has(l.supplierId)) errors[`lines.${i}.supplierId`] = "Choose a supplier from the list.";
  });
  if (Object.keys(errors).length) invalid(errors);
}

/**
 * Posts a manual journal entry (adjustments, capital introduced, expenses
 * paid outside billing…). With an idempotency key, a repeat of the same
 * submit returns the entry already posted (`replayed: true`).
 */
export async function createManualEntry(organizationId: string, userId: string, v: JournalValues, idempotencyKey: string | null) {
  const existing = async () => {
    if (!idempotencyKey) return null;
    return withTenant(organizationId, async (tx) => {
      const [e] = await tx
        .select({ id: journalEntries.id })
        .from(journalEntries)
        .where(and(eq(journalEntries.organizationId, organizationId), eq(journalEntries.idempotencyKey, idempotencyKey)));
      return e ? { ...(await readEntry(tx, organizationId, e.id)), replayed: true } : null;
    });
  };
  const before = await existing();
  if (before) return before;
  try {
    return await withTenant(organizationId, async (tx) => {
      await ensureChart(tx, organizationId);
      await checkJournalRefs(tx, organizationId, v);
      const lockedUntil = await booksLockedUntil(tx, organizationId);
      if (lockedUntil && v.date <= lockedUntil) invalid({ date: `Your books are closed up to ${lockedUntil}. Use a later date, or reopen the period first.` }, "That date is in a closed period.");
      const id = await postEntry(tx, organizationId, {
        date: v.date,
        narration: v.narration,
        sourceType: "manual",
        sourceId: null,
        userId,
        idempotencyKey,
        lines: v.lines.map((l) => ({ account: { id: l.accountId }, debit: l.debitPaise, credit: l.creditPaise, customerId: l.customerId, supplierId: l.supplierId, description: l.description })),
      });
      return { ...(await readEntry(tx, organizationId, id)), replayed: false };
    });
  } catch (e) {
    if (uniqueViolation(e) === "journal_entries_idempotency_uq") {
      const again = await existing();
      if (again) return again;
    }
    throw e;
  }
}

/**
 * Reverses a manual entry with its mirror image. Automatic entries are
 * reversed by voiding their invoice, bill or payment instead.
 */
export async function reverseManualEntry(organizationId: string, userId: string, id: string, input: { date: string; reason: string }) {
  return withTenant(organizationId, async (tx) => {
    const [e] = await tx.select().from(journalEntries).where(and(eq(journalEntries.organizationId, organizationId), eq(journalEntries.id, id))).for("update");
    if (!e) notFound("journal entry");
    if (e.sourceType !== "manual") conflict("AUTOMATIC_ENTRY", "This entry was posted automatically. Void the invoice, bill or payment it came from instead.");
    if (e.reversesEntryId) conflict("IS_REVERSAL", "This entry is itself a reversal.");
    if (input.date < e.entryDate) invalid({ date: "A reversal can't be dated before the entry it reverses." });
    const lockedUntil = await booksLockedUntil(tx, organizationId);
    if (lockedUntil && input.date <= lockedUntil) invalid({ date: `Your books are closed up to ${lockedUntil}. Use a later date.` }, "That date is in a closed period.");
    const reversalId = await reverseEntry(tx, organizationId, id, input.date, `Reversal of ${e.number ?? "entry"}: ${input.reason}`, userId);
    return readEntry(tx, organizationId, reversalId);
  });
}

/* ---------------- Ledger ---------------- */

const LEDGER_LIMIT = 1000;

export async function accountLedger(organizationId: string, accountId: string, range: { from: string; to: string }, party: { customerId?: string | null; supplierId?: string | null } = {}) {
  return withTenant(organizationId, async (tx) => {
    const account = await readAccount(tx, organizationId, accountId);
    const partyFilter = party.customerId ? eq(journalLines.customerId, party.customerId) : party.supplierId ? eq(journalLines.supplierId, party.supplierId) : undefined;
    const base = and(eq(journalLines.organizationId, organizationId), eq(journalLines.accountId, accountId), partyFilter);
    const join = and(eq(journalEntries.organizationId, journalLines.organizationId), eq(journalEntries.id, journalLines.entryId));
    const [open] = await tx
      .select({
        dr: sql<number>`coalesce(sum(${journalLines.debitPaise}), 0)`.mapWith(Number),
        cr: sql<number>`coalesce(sum(${journalLines.creditPaise}), 0)`.mapWith(Number),
      })
      .from(journalLines)
      .innerJoin(journalEntries, join)
      .where(and(base, sql`${journalEntries.entryDate} < ${range.from}`));
    const rows = await tx
      .select({
        entryId: journalEntries.id,
        number: journalEntries.number,
        date: journalEntries.entryDate,
        narration: journalEntries.narration,
        sourceType: journalEntries.sourceType,
        sourceId: journalEntries.sourceId,
        description: journalLines.description,
        customerId: journalLines.customerId,
        supplierId: journalLines.supplierId,
        debitPaise: journalLines.debitPaise,
        creditPaise: journalLines.creditPaise,
      })
      .from(journalLines)
      .innerJoin(journalEntries, join)
      .where(and(base, gte(journalEntries.entryDate, range.from), lte(journalEntries.entryDate, range.to)))
      .orderBy(asc(journalEntries.entryDate), asc(journalEntries.createdAt), asc(journalEntries.id), asc(journalLines.lineNo))
      .limit(LEDGER_LIMIT + 1);
    const openingPaise = normalBalance(account.type, open.dr, open.cr);
    let running = openingPaise;
    const debitNormal = isDebitNormal(account.type);
    const lines = rows.slice(0, LEDGER_LIMIT).map((r) => {
      running += debitNormal ? r.debitPaise - r.creditPaise : r.creditPaise - r.debitPaise;
      return { ...r, balancePaise: running };
    });
    const totals = lines.reduce((a, l) => ({ debitPaise: a.debitPaise + l.debitPaise, creditPaise: a.creditPaise + l.creditPaise }), { debitPaise: 0, creditPaise: 0 });
    return {
      account: { id: account.id, code: account.code, name: account.name, type: account.type as AccountType, isSystem: account.isSystem },
      from: range.from,
      to: range.to,
      openingPaise,
      lines,
      ...totals,
      closingPaise: running,
      truncated: rows.length > LEDGER_LIMIT,
    };
  });
}

/* ---------------- Statements ---------------- */

/** Every account's closing balance on a date; debits equal credits. */
export async function trialBalance(organizationId: string, asOf: string) {
  return withTenant(organizationId, async (tx) => {
    await ensureChart(tx, organizationId);
    const rows = (await accountTotals(tx, organizationId, { to: asOf }))
      .map((t) => {
        const net = t.debitPaise - t.creditPaise;
        return { id: t.id, code: t.code, name: t.name, type: t.type, debitPaise: net > 0 ? net : 0, creditPaise: net < 0 ? -net : 0 };
      })
      .filter((r) => r.debitPaise !== 0 || r.creditPaise !== 0);
    const debitPaise = rows.reduce((a, r) => a + r.debitPaise, 0);
    const creditPaise = rows.reduce((a, r) => a + r.creditPaise, 0);
    return { asOf, rows, debitPaise, creditPaise, balanced: debitPaise === creditPaise };
  });
}

type StatementLine = { id: string; code: string; name: string; amountPaise: number };
const section = (totals: Totals[], type: AccountType): { lines: StatementLine[]; totalPaise: number } => {
  const lines = totals
    .filter((t) => t.type === type)
    .map((t) => ({ id: t.id, code: t.code, name: t.name, amountPaise: normalBalance(t.type, t.debitPaise, t.creditPaise) }))
    .filter((l) => l.amountPaise !== 0);
  return { lines, totalPaise: lines.reduce((a, l) => a + l.amountPaise, 0) };
};

/** Income and expenses for entries dated in [from, to]. */
export async function profitAndLoss(organizationId: string, range: { from: string; to: string }) {
  return withTenant(organizationId, async (tx) => {
    await ensureChart(tx, organizationId);
    const totals = await accountTotals(tx, organizationId, range);
    const income = section(totals, "income");
    const expenses = section(totals, "expense");
    return { ...range, income, expenses, netProfitPaise: income.totalPaise - expenses.totalPaise };
  });
}

/**
 * Assets = liabilities + equity on a date. There are no closing entries, so
 * profit is shown as two equity lines: earlier years, and this financial year
 * up to the date.
 */
export async function balanceSheet(organizationId: string, asOf: string) {
  return withTenant(organizationId, async (tx) => {
    await ensureChart(tx, organizationId);
    const fy = financialYearRange(asOf, await startMonth(tx, organizationId));
    const all = await accountTotals(tx, organizationId, { to: asOf });
    const before = await accountTotals(tx, organizationId, { to: dayBefore(fy.from) });
    const profit = (t: Totals[]) => section(t, "income").totalPaise - section(t, "expense").totalPaise;
    const retainedPaise = profit(before);
    const currentPaise = profit(all) - retainedPaise;
    const assets = section(all, "asset");
    const liabilities = section(all, "liability");
    const equity = section(all, "equity");
    const equityTotal = equity.totalPaise + retainedPaise + currentPaise;
    return {
      asOf,
      financialYear: fy,
      assets,
      liabilities,
      equity: { ...equity, retainedPaise, currentProfitPaise: currentPaise, totalPaise: equityTotal },
      liabilitiesAndEquityPaise: liabilities.totalPaise + equityTotal,
      balanced: assets.totalPaise === liabilities.totalPaise + equityTotal,
    };
  });
}

const dayBefore = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

/* ---------------- Settings ---------------- */

export async function accountingSettings(organizationId: string) {
  return withTenant(organizationId, async (tx) => {
    const [s] = await tx
      .select({ booksLockedUntil: billingSettings.booksLockedUntil, startMonth: billingSettings.financialYearStartMonth })
      .from(billingSettings)
      .where(eq(billingSettings.organizationId, organizationId));
    const today = todayInIndia();
    return { configured: !!s, booksLockedUntil: s?.booksLockedUntil ?? null, financialYearStartMonth: s?.startMonth ?? 4, today, financialYear: financialYearRange(today, s?.startMonth ?? 4) };
  });
}

/** Closes the books up to a date (or reopens them with null). */
export async function setBooksLock(organizationId: string, userId: string, booksLockedUntil: string | null) {
  return withTenant(organizationId, async (tx) => {
    const updated = await tx
      .update(billingSettings)
      .set({ booksLockedUntil, updatedBy: userId, updatedAt: new Date() })
      .where(eq(billingSettings.organizationId, organizationId))
      .returning({ id: billingSettings.organizationId });
    if (!updated.length) conflict("NOT_SET_UP", "Save your company details first.");
  }).then(() => accountingSettings(organizationId));
}

/* ---------------- Bringing earlier records into the books ---------------- */

// Records saved before accounting existed (or imported) have no journal entry.
// The backfill posts them, dated as they happened, ignoring the period lock.
// Voided records are skipped: posting and reversing them nets to nothing.

const DOC_TABLES: Record<PostedDocument, { table: string; party: "customer_id" | "supplier_id" }> = {
  invoices: { table: "business_invoices", party: "customer_id" },
  "credit-notes": { table: "credit_notes", party: "customer_id" },
  "debit-notes": { table: "debit_notes", party: "customer_id" },
  "purchase-bills": { table: "purchase_bills", party: "supplier_id" },
  "purchase-returns": { table: "purchase_returns", party: "supplier_id" },
};

const notPosted = (sourceType: string, idCol: SQL) =>
  sql`not exists (select 1 from journal_entries j where j.organization_id = ${sql.raw("t.organization_id")} and j.source_type = ${sourceType} and j.source_id = ${idCol} and j.reverses_entry_id is null)`;

type UnpostedDoc = {
  id: string;
  number: string | null;
  issue_date: string | Date;
  party_id: string;
  party_name: string | null;
  reverse_charge: boolean;
  taxable_paise: string | number;
  cgst_paise: string | number;
  sgst_paise: string | number;
  igst_paise: string | number;
  cess_paise: string | number;
  round_off_paise: string | number;
  total_paise: string | number;
};

async function unpostedDocuments(tx: TenantTx, organizationId: string, slug: PostedDocument, limit?: number) {
  const d = DOC_TABLES[slug];
  const { rows } = await tx.execute<UnpostedDoc>(sql`
    select t.id, t.number, t.issue_date, t.${sql.raw(d.party)} as party_id, t.party_name, t.reverse_charge,
      t.taxable_paise, t.cgst_paise, t.sgst_paise, t.igst_paise, t.cess_paise, t.round_off_paise, t.total_paise
    from ${sql.raw(d.table)} t
    where t.organization_id = ${organizationId} and t.number is not null and t.voided_at is null
      and ${notPosted(documentSource(slug), sql.raw("t.id"))}
    order by t.issue_date, t.created_at
    ${limit ? sql`limit ${limit}` : sql``}`);
  return rows;
}

type UnpostedPayment = { id: string; number: string | null; date: string | Date; amount_paise: string | number; method: string; party_id: string; party_name: string; direction: "received" | "made" };

async function unpostedPayments(tx: TenantTx, organizationId: string) {
  const { rows } = await tx.execute<UnpostedPayment>(sql`
    select t.id, t.number, t.payment_date as date, t.amount_paise, t.method, t.direction,
      coalesce(t.customer_id, t.supplier_id) as party_id, coalesce(c.name, s.name) as party_name
    from business_payments t
    left join customers c on c.organization_id = t.organization_id and c.id = t.customer_id
    left join suppliers s on s.organization_id = t.organization_id and s.id = t.supplier_id
    where t.organization_id = ${organizationId} and t.voided_at is null
      and ${notPosted("payment_received", sql.raw("t.id"))} and ${notPosted("payment_made", sql.raw("t.id"))}
    order by t.payment_date, t.created_at`);
  return rows;
}

async function unpostedRefunds(tx: TenantTx, organizationId: string) {
  const { rows } = await tx.execute<Omit<UnpostedPayment, "direction">>(sql`
    select t.id, t.number, t.refund_date as date, t.amount_paise, t.method, t.customer_id as party_id, c.name as party_name
    from refunds t
    join customers c on c.organization_id = t.organization_id and c.id = t.customer_id
    where t.organization_id = ${organizationId} and t.voided_at is null and ${notPosted("refund", sql.raw("t.id"))}
    order by t.refund_date, t.created_at`);
  return rows;
}

/** Customers and suppliers whose opening balance isn't (fully) in the books. */
async function unsyncedOpenings(tx: TenantTx, organizationId: string) {
  const { rows } = await tx.execute<{ kind: "customer" | "supplier"; id: string; name: string; opening: string | number }>(sql`
    select 'customer' as kind, c.id, c.name, c.opening_balance_paise as opening from customers c
    where c.organization_id = ${organizationId}
      and c.opening_balance_paise <> coalesce((select sum(l.debit_paise - l.credit_paise) from journal_lines l join journal_entries j on j.organization_id = l.organization_id and j.id = l.entry_id
        where l.organization_id = c.organization_id and l.customer_id = c.id and j.source_type = 'opening' and j.source_id = c.id), 0)
    union all
    select 'supplier', s.id, s.name, s.opening_balance_paise from suppliers s
    where s.organization_id = ${organizationId}
      and -s.opening_balance_paise <> coalesce((select sum(l.debit_paise - l.credit_paise) from journal_lines l join journal_entries j on j.organization_id = l.organization_id and j.id = l.entry_id
        where l.organization_id = s.organization_id and l.supplier_id = s.id and j.source_type = 'opening' and j.source_id = s.id), 0)`);
  return rows;
}

/** How many earlier records aren't in the books yet. */
export async function backfillStatus(organizationId: string) {
  return withTenant(organizationId, async (tx) => {
    let documents = 0;
    for (const slug of POSTED_DOCUMENTS) documents += (await unpostedDocuments(tx, organizationId, slug)).length;
    const payments = (await unpostedPayments(tx, organizationId)).length;
    const refunds = (await unpostedRefunds(tx, organizationId)).length;
    const openingBalances = (await unsyncedOpenings(tx, organizationId)).length;
    return { documents, payments, refunds, openingBalances, total: documents + payments + refunds + openingBalances };
  });
}

/** Posts every earlier record that isn't in the books. Safe to run again: posted records are skipped. */
export async function backfillBooks(organizationId: string, userId: string) {
  await withTenant(organizationId, async (tx) => {
    // One backfill per company at a time.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`books-backfill:${organizationId}`}))`);
    await ensureChart(tx, organizationId);
    const today = todayInIndia();
    for (const o of await unsyncedOpenings(tx, organizationId)) {
      await syncOpeningBalance(tx, organizationId, { kind: o.kind, id: o.id, name: o.name, openingBalancePaise: Number(o.opening) }, today, userId);
    }
    const n = (v: string | number) => Number(v);
    for (const slug of POSTED_DOCUMENTS) {
      for (const d of await unpostedDocuments(tx, organizationId, slug)) {
        await postDocument(
          tx,
          organizationId,
          slug,
          {
            id: d.id,
            number: d.number,
            issueDate: isoDay(d.issue_date),
            partyId: d.party_id,
            partyName: d.party_name,
            reverseCharge: d.reverse_charge,
            taxablePaise: n(d.taxable_paise),
            cgstPaise: n(d.cgst_paise),
            sgstPaise: n(d.sgst_paise),
            igstPaise: n(d.igst_paise),
            cessPaise: n(d.cess_paise),
            roundOffPaise: n(d.round_off_paise),
            totalPaise: n(d.total_paise),
          },
          { userId, ignoreLock: true },
        );
      }
    }
    for (const p of await unpostedPayments(tx, organizationId)) {
      await postPayment(tx, organizationId, { id: p.id, number: p.number, direction: p.direction, date: isoDay(p.date), amountPaise: n(p.amount_paise), method: p.method, partyId: p.party_id, partyName: p.party_name }, { userId, ignoreLock: true });
    }
    for (const r of await unpostedRefunds(tx, organizationId)) {
      await postRefund(tx, organizationId, { id: r.id, number: r.number, date: isoDay(r.date), amountPaise: n(r.amount_paise), method: r.method, customerId: r.party_id, customerName: r.party_name }, { userId, ignoreLock: true });
    }
  });
  return backfillStatus(organizationId);
}

/** A date column from a raw query: "2026-11-10", or a Date at local midnight (node-postgres). */
const isoDay = (v: string | Date) =>
  typeof v === "string" ? v.slice(0, 10) : `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;

/* ---------------- Lookups for the entry form ---------------- */

export async function journalLookups(organizationId: string) {
  return withTenant(organizationId, async (tx) => {
    await ensureChart(tx, organizationId);
    const accts = await tx
      .select({ id: accounts.id, code: accounts.code, name: accounts.name, type: accounts.type, systemKey: accounts.systemKey })
      .from(accounts)
      .where(and(eq(accounts.organizationId, organizationId), isNull(accounts.archivedAt)))
      .orderBy(asc(accounts.code));
    const custs = await tx.select({ id: customers.id, name: customers.name }).from(customers).where(and(eq(customers.organizationId, organizationId), isNull(customers.archivedAt))).orderBy(asc(customers.name)).limit(500);
    const sups = await tx.select({ id: suppliers.id, name: suppliers.name }).from(suppliers).where(and(eq(suppliers.organizationId, organizationId), isNull(suppliers.archivedAt))).orderBy(asc(suppliers.name)).limit(500);
    return { accounts: accts, customers: custs, suppliers: sups, booksLockedUntil: await booksLockedUntil(tx, organizationId) };
  });
}

