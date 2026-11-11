import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import { journalEntries, organization } from "@/db/schema";
import { removeTestTenants } from "@/test/cleanup-tenants";

import { validateCustomer, validateSupplier } from "../contacts-validation";
import { createCustomer, updateCustomer } from "../customers";
import { createDraft, issueDocument, voidDocument } from "../documents/service";
import type { DocumentSlug } from "../documents/types";
import { validateDocument } from "../documents/validation";
import { recordPayment, voidPayment } from "../payments/service";
import { recordSupplierPayment } from "../payments/supplier-payments";
import { uniqueViolation } from "../records";
import { saveBillingSettings } from "../settings";
import { createSupplier } from "../suppliers";
import { withTenant } from "../tenant-db";
import { postDocument } from "./posting";
import {
  accountLedger,
  backfillBooks,
  backfillStatus,
  balanceSheet,
  createAccount,
  createManualEntry,
  listAccounts,
  listJournal,
  profitAndLoss,
  reverseManualEntry,
  setAccountArchived,
  setBooksLock,
  trialBalance,
  updateAccount,
} from "./service";
import { validateJournal } from "./validation";

// Real database: automatic double-entry posting, reversals, the period lock,
// manual entries and the statements.

const stamp = Date.now().toString(36);
const A = `acctest-a-${stamp}`;
const B = `acctest-b-${stamp}`;
const USER = null as unknown as string;
const ids: Record<string, string> = {};
const DAY = "2026-11-10";

async function code(p: Promise<unknown>) {
  try {
    await p;
    return "ok";
  } catch (e) {
    return (e as { body?: { code?: string } }).body?.code ?? String((e as Error).message ?? e);
  }
}

const line = (over: Record<string, unknown> = {}) => ({ description: "Steel rod", hsnSac: "7214", quantity: "1", rate: "1000", taxRate: "18", ...over });
function docValues(slug: DocumentSlug, over: Record<string, unknown> = {}) {
  const party = slug.startsWith("purchase") ? { supplierId: ids.supplier } : { customerId: ids.customer };
  const r = validateDocument(slug, {
    ...party,
    issueDate: DAY,
    partyReference: slug === "purchase-bills" ? `SB-${Math.random().toString(36).slice(2, 8)}` : undefined,
    lines: [line()],
    ...over,
  });
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.values;
}
const issue = async (slug: DocumentSlug, over: Record<string, unknown> = {}, org = A) => issueDocument(org, USER, slug, (await createDraft(org, USER, slug, docValues(slug, over))).id);

/** An account's id by its system key. */
async function acct(key: string, org = A) {
  const { accounts } = await listAccounts(org);
  return accounts.find((a) => a.systemKey === key)!;
}

/** Lines of the original (non-reversal) entry for a source, as { accountKey: signed debit−credit }. */
async function postingFor(sourceType: string, sourceId: string) {
  return withTenant(A, async (tx) => {
    const { rows } = await tx.execute<{ key: string; net: string; reversal: boolean }>(sql`
      select a.system_key as key, sum(l.debit_paise - l.credit_paise) as net, (e.reverses_entry_id is not null) as reversal
      from journal_lines l join journal_entries e on e.organization_id = l.organization_id and e.id = l.entry_id
      join accounts a on a.organization_id = l.organization_id and a.id = l.account_id
      where e.organization_id = ${A} and e.source_type = ${sourceType} and e.source_id = ${sourceId}
      group by a.system_key, e.reverses_entry_id is not null`);
    const pick = (rev: boolean) => Object.fromEntries(rows.filter((r) => r.reversal === rev).map((r) => [r.key, Number(r.net)]));
    return { original: pick(false), reversal: pick(true) };
  });
}

function journal(raw: Record<string, unknown>) {
  const r = validateJournal(raw);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.values;
}

beforeAll(async () => {
  await db.insert(organization).values([
    { id: A, name: "Acc A", slug: A, createdAt: new Date() },
    { id: B, name: "Acc B", slug: B, createdAt: new Date() },
  ]);
  const company = { legalName: "Books Co", tradeName: null, gstin: "27ABCDE1234F1Z5", pan: null, email: null, phone: null, addressLine1: null, addressLine2: null, city: null, state: null, postalCode: null, countryCode: "IN", currency: "INR" as const, financialYearStartMonth: 4, invoicePrefix: "INV" };
  await saveBillingSettings(A, USER, company);
  await saveBillingSettings(B, USER, { ...company, legalName: "Other Co" });
  const c = validateCustomer({ name: "Pune Buyer", paymentTermsDays: "15", openingBalance: "500", billingAddress: { countryCode: "IN", stateCode: "27" } });
  if (!c.ok) throw new Error(JSON.stringify(c.errors));
  ids.customer = (await createCustomer(A, USER, c.values)).id;
  const s = validateSupplier({ name: "Pune Steel", gstin: "27AAACP1234A1Z5", stateCode: "27", countryCode: "IN", openingBalance: "1000" });
  if (!s.ok) throw new Error(JSON.stringify(s.errors));
  ids.supplier = (await createSupplier(A, USER, s.values)).id;
});

afterAll(() => removeTestTenants([A, B]));

describe("chart of accounts", () => {
  it("creates the standard accounts on first use, once", async () => {
    const first = await listAccounts(A);
    const again = await listAccounts(A);
    expect(first.accounts.filter((a) => a.isSystem)).toHaveLength(20);
    expect(again.accounts.map((a) => a.id)).toEqual(first.accounts.map((a) => a.id));
    expect(first.accounts.find((a) => a.systemKey === "receivables")).toMatchObject({ code: "1100", type: "asset" });
  });

  it("adds custom accounts; codes are unique; standard accounts can't be archived", async () => {
    const rent = await createAccount(A, USER, { code: "6100", name: "Rent", type: "expense", parentId: null });
    ids.rent = rent.id;
    expect(await code(createAccount(A, USER, { code: "6100", name: "Rent again", type: "expense", parentId: null }))).toBe("DUPLICATE");
    expect(await code(setAccountArchived(A, USER, (await acct("sales")).id, true))).toBe("SYSTEM_ACCOUNT");
    expect(await code(updateAccount(A, USER, (await acct("sales")).id, { code: "4000", name: "Revenue", type: "expense", parentId: null }))).toBe("INVALID_FIELDS");
    // Renaming a standard account is fine; postings follow its key, not its name.
    expect((await updateAccount(A, USER, (await acct("sales")).id, { code: "4000", name: "Revenue from sales", type: "income", parentId: null })).name).toBe("Revenue from sales");
  });

  it("is per company", async () => {
    const b = await listAccounts(B);
    expect(b.accounts.some((a) => a.code === "6100")).toBe(false);
    expect(await code(accountLedger(B, ids.rent, { from: "2026-04-01", to: DAY }))).toBe("NOT_FOUND");
  });
});

describe("automatic posting", () => {
  it("posts opening balances against opening balance equity, and re-syncs on change", async () => {
    const c = await postingFor("opening", ids.customer);
    expect(c.original).toEqual({ receivables: 50000, opening_equity: -50000 });
    const s = await postingFor("opening", ids.supplier);
    expect(s.original).toEqual({ payables: -100000, opening_equity: 100000 });

    const v = validateCustomer({ name: "Pune Buyer", paymentTermsDays: "15", openingBalance: "800", billingAddress: { countryCode: "IN", stateCode: "27" } });
    if (!v.ok) throw new Error();
    await updateCustomer(A, USER, ids.customer, v.values);
    expect((await postingFor("opening", ids.customer)).original).toEqual({ receivables: 80000, opening_equity: -80000 });
  });

  it("an invoice: Dr debtors, Cr sales and output GST", async () => {
    const inv = await issue("invoices");
    ids.invoice = inv.id;
    expect((await postingFor("document:invoices", inv.id)).original).toEqual({ receivables: 118000, sales: -100000, output_cgst: -9000, output_sgst: -9000 });
  });

  it("refuses a second original posting for the same document", async () => {
    const again = withTenant(A, (tx) =>
      postDocument(tx, A, "invoices", { id: ids.invoice, number: "X", issueDate: DAY, partyId: ids.customer, partyName: "x", reverseCharge: false, taxablePaise: 100, cgstPaise: 0, sgstPaise: 0, igstPaise: 0, cessPaise: 0, roundOffPaise: 0, totalPaise: 100 }),
    );
    expect(await again.then(() => "ok", (e) => uniqueViolation(e))).toBe("journal_entries_one_posting_uq");
  });

  it("a credit note is the mirror image, to sales returns", async () => {
    const cn = await issue("credit-notes", { invoiceId: ids.invoice, reason: "Damaged", lines: [line({ rate: "100" })] });
    expect((await postingFor("document:credit-notes", cn.id)).original).toEqual({ receivables: -11800, sales_returns: 10000, output_cgst: 900, output_sgst: 900 });
  });

  it("a payment received: Dr bank, Cr debtors; voiding posts the reversal and keeps the original", async () => {
    const p = await recordPayment(A, USER, { customerId: ids.customer, paymentDate: DAY, amountPaise: 50000, method: "upi", reference: "UTR9", notes: null, allocations: [{ invoiceId: ids.invoice, amountPaise: 50000 }] }, null);
    expect((await postingFor("payment_received", p.id)).original).toEqual({ bank: 50000, receivables: -50000 });
    await voidPayment(A, USER, p.id, "Bounced");
    const after = await postingFor("payment_received", p.id);
    expect(after.original).toEqual({ bank: 50000, receivables: -50000 });
    expect(after.reversal).toEqual({ bank: -50000, receivables: 50000 });
  });

  it("a purchase bill: Dr purchases and input GST, Cr creditors; paying in cash credits cash", async () => {
    const bill = await issue("purchase-bills");
    expect((await postingFor("document:purchase-bills", bill.id)).original).toEqual({ purchases: 100000, input_cgst: 9000, input_sgst: 9000, payables: -118000 });
    const pay = await recordSupplierPayment(A, USER, { supplierId: ids.supplier, paymentDate: DAY, amountPaise: 118000, method: "cash", reference: null, notes: null, allocations: [{ billId: bill.id, amountPaise: 118000 }] }, null);
    expect((await postingFor("payment_made", pay.id)).original).toEqual({ payables: 118000, cash: -118000 });
  });

  it("voiding an invoice reverses its posting", async () => {
    const inv = await issue("invoices", { lines: [line({ rate: "200" })] });
    await voidDocument(A, USER, "invoices", inv.id, "Wrong customer");
    const p = await postingFor("document:invoices", inv.id);
    expect(p.reversal).toEqual({ receivables: -23600, sales: 20000, output_cgst: 1800, output_sgst: 1800 });
  });
});

describe("the database guards the books", () => {
  it("refuses changing or deleting posted lines and entries", async () => {
    const [entry] = await withTenant(A, (tx) => tx.select({ id: journalEntries.id }).from(journalEntries).where(eq(journalEntries.organizationId, A)).limit(1));
    expect(await code(withTenant(A, (tx) => tx.execute(sql`update journal_lines set debit_paise = debit_paise + 1 where organization_id = ${A} and entry_id = ${entry.id}`)))).not.toBe("ok");
    expect(await code(withTenant(A, (tx) => tx.execute(sql`delete from journal_lines where organization_id = ${A} and entry_id = ${entry.id}`)))).not.toBe("ok");
    expect(await code(withTenant(A, (tx) => tx.execute(sql`update journal_entries set narration = 'x' where organization_id = ${A} and id = ${entry.id}`)))).not.toBe("ok");
    expect(await code(withTenant(A, (tx) => tx.delete(journalEntries).where(and(eq(journalEntries.organizationId, A), eq(journalEntries.id, entry.id)))))).not.toBe("ok");
  });

  it("refuses an unbalanced entry at commit", async () => {
    const r = await code(
      withTenant(A, async (tx) => {
        const sales = (await acct("sales")).id;
        await tx.execute(sql`insert into journal_entries (id, organization_id, entry_date, source_type, posted_at) values ('jx-${sql.raw(stamp)}', ${A}, ${DAY}, 'manual', now())`);
        await tx.execute(sql`insert into journal_lines (id, organization_id, entry_id, line_no, account_id, debit_paise, credit_paise) values ('lx-${sql.raw(stamp)}', ${A}, ${`jx-${stamp}`}, 1, ${sales}, 100, 0)`);
      }),
    );
    expect(r).not.toBe("ok");
    const [gone] = await withTenant(A, (tx) => tx.select({ id: journalEntries.id }).from(journalEntries).where(and(eq(journalEntries.organizationId, A), eq(journalEntries.id, `jx-${stamp}`))));
    expect(gone).toBeUndefined();
  });
});

describe("manual entries", () => {
  it("checks debits equal credits before saving", () => {
    const r = validateJournal({ date: DAY, narration: "Rent", lines: [{ accountId: "a", debit: "100" }, { accountId: "b", credit: "90" }] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.lines).toMatch(/must be equal/);
    const both = validateJournal({ date: DAY, narration: "Rent", lines: [{ accountId: "a", debit: "100", credit: "100" }, { accountId: "b", credit: "100" }] });
    expect(!both.ok && both.errors["lines.0.debit"]).toMatch(/not both/);
  });

  it("posts, replays with the same key, and reverses once", async () => {
    const v = journal({ date: DAY, narration: "November rent", lines: [{ accountId: ids.rent, debit: "25000" }, { accountId: (await acct("bank")).id, credit: "25000" }] });
    const e = await createManualEntry(A, USER, v, `rent-${stamp}`);
    expect(e).toMatchObject({ replayed: false, sourceType: "manual", totalPaise: 2500000 });
    expect(e.number).toMatch(/^JV/);
    const again = await createManualEntry(A, USER, v, `rent-${stamp}`);
    expect(again).toMatchObject({ id: e.id, replayed: true });

    const rev = await reverseManualEntry(A, USER, e.id, { date: DAY, reason: "Posted twice" });
    expect(rev.reverses?.id).toBe(e.id);
    expect(rev.lines.map((l) => [l.debitPaise, l.creditPaise])).toEqual([[0, 2500000], [2500000, 0]]);
    expect(await code(reverseManualEntry(A, USER, e.id, { date: DAY, reason: "again" }))).toBe("ALREADY_REVERSED");
    expect(await code(reverseManualEntry(A, USER, rev.id, { date: DAY, reason: "again" }))).toBe("IS_REVERSAL");

    // The journal list shows each entry's amount and which entry reversed it.
    const listed = (await listJournal(A, { page: 1, pageSize: 100, q: null, from: null, to: null, source: "manual" })).items;
    expect(listed.find((i) => i.id === e.id)).toMatchObject({ amountPaise: 2500000, reversedById: rev.id, reversesEntryId: null });
    expect(listed.find((i) => i.id === rev.id)).toMatchObject({ amountPaise: 2500000, reversedById: null, reversesEntryId: e.id });
  });

  it("automatic entries are reversed by voiding their source, not here", async () => {
    const auto = (await listJournal(A, { page: 1, pageSize: 50, q: null, from: null, to: null, source: "automatic" })).items.find((i) => !i.reversesEntryId)!;
    expect(await code(reverseManualEntry(A, USER, auto.id, { date: DAY, reason: "x" }))).toBe("AUTOMATIC_ENTRY");
  });

  it("refuses archived accounts and other companies' accounts", async () => {
    const tmp = await createAccount(A, USER, { code: "6900", name: "Temp", type: "expense", parentId: null });
    await setAccountArchived(A, USER, tmp.id, true);
    const bank = (await acct("bank")).id;
    expect(await code(createManualEntry(A, USER, journal({ date: DAY, narration: "x", lines: [{ accountId: tmp.id, debit: "1" }, { accountId: bank, credit: "1" }] }), null))).toBe("INVALID_FIELDS");
    const bBank = (await acct("bank", B)).id;
    expect(await code(createManualEntry(A, USER, journal({ date: DAY, narration: "x", lines: [{ accountId: bBank, debit: "1" }, { accountId: bank, credit: "1" }] }), null))).toBe("INVALID_FIELDS");
  });

  it("an account with a balance can't be archived or change type", async () => {
    await createManualEntry(A, USER, journal({ date: DAY, narration: "Rent", lines: [{ accountId: ids.rent, debit: "100" }, { accountId: (await acct("cash")).id, credit: "100" }] }), null);
    expect(await code(setAccountArchived(A, USER, ids.rent, true))).toBe("HAS_BALANCE");
    expect(await code(updateAccount(A, USER, ids.rent, { code: "6100", name: "Rent", type: "asset", parentId: null }))).toBe("INVALID_FIELDS");
  });
});

describe("closing the books", () => {
  it("refuses issuing, payments and entries dated on or before the lock date", async () => {
    await setBooksLock(A, USER, "2026-11-05");
    expect(await code(issue("invoices", { issueDate: "2026-11-01" }))).toBe("INVALID_FIELDS");
    expect(await code(recordPayment(A, USER, { customerId: ids.customer, paymentDate: "2026-11-05", amountPaise: 100, method: "cash", reference: null, notes: null, allocations: [] }, null))).toBe("INVALID_FIELDS");
    const bank = (await acct("bank")).id;
    expect(await code(createManualEntry(A, USER, journal({ date: "2026-11-01", narration: "x", lines: [{ accountId: ids.rent, debit: "1" }, { accountId: bank, credit: "1" }] }), null))).toBe("INVALID_FIELDS");
    // After the lock date is fine.
    expect(await code(issue("invoices", { issueDate: "2026-11-06" }))).toBe("ok");
    await setBooksLock(A, USER, null);
    expect(await code(issue("invoices", { issueDate: "2026-11-01" }))).toBe("ok");
  });
});

describe("statements", () => {
  it("trial balance: debits equal credits", async () => {
    const tb = await trialBalance(A, DAY);
    expect(tb.balanced).toBe(true);
    expect(tb.debitPaise).toBeGreaterThan(0);
  });

  it("profit and loss: income less expenses, net of returns", async () => {
    const pl = await profitAndLoss(A, { from: "2026-04-01", to: "2026-11-30" });
    const sales = pl.income.lines.find((l) => l.code === "4000")!;
    const returns = pl.income.lines.find((l) => l.code === "4010")!;
    expect(returns.amountPaise).toBe(-10000);
    expect(pl.income.totalPaise).toBe(sales.amountPaise + returns.amountPaise);
    expect(pl.netProfitPaise).toBe(pl.income.totalPaise - pl.expenses.totalPaise);
  });

  it("balance sheet: assets = liabilities + equity, with this year's profit", async () => {
    const bs = await balanceSheet(A, "2026-11-30");
    const pl = await profitAndLoss(A, { from: "2026-04-01", to: "2026-11-30" });
    expect(bs.balanced).toBe(true);
    expect(bs.equity.currentProfitPaise).toBe(pl.netProfitPaise);
    expect(bs.equity.retainedPaise).toBe(0);
    expect(bs.financialYear).toMatchObject({ from: "2026-04-01", to: "2027-03-31", label: "2026-27" });
  });

  it("ledger: opening, running and closing balances", async () => {
    const recv = (await acct("receivables")).id;
    const l = await accountLedger(A, recv, { from: DAY, to: "2026-11-30" });
    // Opening = everything posted before the period (the invoices dated 1 and 6 Nov).
    expect(l.openingPaise).toBe((await accountLedger(A, recv, { from: "2026-04-01", to: "2026-11-09" })).closingPaise);
    expect(l.closingPaise).toBe(l.openingPaise + l.debitPaise - l.creditPaise);
    expect(l.lines.at(-1)?.balancePaise).toBe(l.closingPaise);
    const tb = await trialBalance(A, "2026-11-30");
    const row = tb.rows.find((r) => r.id === recv)!;
    expect(row.debitPaise - row.creditPaise).toBe(l.closingPaise);
  });
});

describe("bringing earlier records into the books", () => {
  it("posts records saved before accounting, once", async () => {
    const inv = await issue("invoices", { lines: [line({ rate: "300" })] });
    // Pretend it was issued before accounting existed: remove its posting.
    await db.transaction(async (tx) => {
      await tx.execute(sql`set local session_replication_role = replica`);
      await tx.execute(sql`delete from journal_lines where organization_id = ${A} and entry_id in (select id from journal_entries where organization_id = ${A} and source_id = ${inv.id})`);
      await tx.execute(sql`delete from journal_entries where organization_id = ${A} and source_id = ${inv.id}`);
    });
    expect((await backfillStatus(A)).documents).toBe(1);
    const after = await backfillBooks(A, USER);
    expect(after.total).toBe(0);
    expect((await postingFor("document:invoices", inv.id)).original).toEqual({ receivables: 35400, sales: -30000, output_cgst: -2700, output_sgst: -2700 });
    await backfillBooks(A, USER);
    const count = await withTenant(A, (tx) => tx.select({ id: journalEntries.id }).from(journalEntries).where(and(eq(journalEntries.organizationId, A), eq(journalEntries.sourceId, inv.id))));
    expect(count).toHaveLength(1);
    expect((await trialBalance(A, "2026-11-30")).balanced).toBe(true);
  });
});
