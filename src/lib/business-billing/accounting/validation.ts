import { FieldReader, type FieldErrors } from "../fields";
import { ACCOUNT_TYPE_LABELS, type AccountType } from "./chart";

// Input checks for the accounting screens. Pure: the browser runs them for
// instant messages, the API runs them again before anything is saved.

type Result<T> = { ok: true; values: T } | { ok: false; errors: FieldErrors };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const isIsoDate = (v: unknown): v is string =>
  typeof v === "string" && DATE_RE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v);

function readDate(r: FieldReader, key: string, required: string | null): string | null {
  const v = r.text(key, 10, required ?? undefined);
  if (v && !isIsoDate(v)) {
    r.fail(key, "Enter a date as YYYY-MM-DD.");
    return null;
  }
  return v;
}

/* ---------------- Accounts ---------------- */

export const ACCOUNT_TYPES = Object.keys(ACCOUNT_TYPE_LABELS) as AccountType[];
export const ACCOUNT_CODE_RE = /^[A-Za-z0-9][A-Za-z0-9./-]{0,19}$/;

export type AccountValues = { code: string; name: string; type: AccountType; parentId: string | null };

export function validateAccount(raw: Record<string, unknown>): Result<AccountValues> {
  const r = new FieldReader(raw);
  const code = r.text("code", 20, "Enter an account code, e.g. 6100.");
  if (code && !ACCOUNT_CODE_RE.test(code)) r.fail("code", "Use letters, digits, '.', '/' or '-' (no spaces).");
  const name = r.text("name", 120, "Enter the account name.");
  const type = r.oneOf("type", ACCOUNT_TYPES, "Choose the account type.");
  const parentId = r.id("parentId");
  if (!r.ok) return { ok: false, errors: r.errors };
  return { ok: true, values: { code: code!, name: name!, type, parentId } };
}

/* ---------------- Manual journal entries ---------------- */

export type JournalLineValues = {
  accountId: string;
  debitPaise: number;
  creditPaise: number;
  customerId: string | null;
  supplierId: string | null;
  description: string | null;
};
export type JournalValues = { date: string; narration: string; lines: JournalLineValues[] };

export const MAX_JOURNAL_LINES = 100;

/**
 * { date, narration, lines: [{ accountId, debit, credit, customerId?, supplierId?, description? }] }
 * with amounts in rupees. Blank rows are dropped. Debits must equal credits.
 */
export function validateJournal(raw: Record<string, unknown>): Result<JournalValues> {
  const r = new FieldReader(raw);
  const date = readDate(r, "date", "Enter the entry date.");
  const narration = r.text("narration", 500, "Say what this entry is for.");
  const errors: FieldErrors = { ...r.errors };
  const list = Array.isArray(raw.lines) ? raw.lines : [];
  if (list.length > MAX_JOURNAL_LINES) errors.lines = `Use at most ${MAX_JOURNAL_LINES} lines.`;
  const lines: JournalLineValues[] = [];
  list.slice(0, MAX_JOURNAL_LINES).forEach((item, i) => {
    const lr = new FieldReader(item && typeof item === "object" ? (item as Record<string, unknown>) : {});
    const accountId = lr.id("accountId");
    const debitPaise = lr.rupees("debit") ?? 0;
    const creditPaise = lr.rupees("credit") ?? 0;
    const customerId = lr.id("customerId");
    const supplierId = lr.id("supplierId");
    const description = lr.text("description", 200);
    const blank = !accountId && debitPaise === 0 && creditPaise === 0 && !description;
    if (!blank) {
      if (!accountId) lr.fail("accountId", "Choose an account.");
      if (debitPaise > 0 && creditPaise > 0) lr.fail("debit", "Enter a debit or a credit, not both.");
      else if (debitPaise === 0 && creditPaise === 0 && !lr.has("debit") && !lr.has("credit")) lr.fail("debit", "Enter a debit or a credit amount.");
      if (customerId && supplierId) lr.fail("customerId", "Pick a customer or a supplier, not both.");
    }
    for (const [k, v] of Object.entries(lr.errors)) errors[`lines.${i}.${k}`] ??= v;
    if (!blank && lr.ok) lines.push({ accountId: accountId!, debitPaise, creditPaise, customerId, supplierId, description });
  });
  const dr = lines.reduce((a, l) => a + l.debitPaise, 0);
  const cr = lines.reduce((a, l) => a + l.creditPaise, 0);
  if (!Object.keys(errors).some((k) => k.startsWith("lines."))) {
    if (lines.length < 2) errors.lines ??= "An entry needs at least two lines: one debit and one credit.";
    else if (dr !== cr) errors.lines ??= `Debits and credits must be equal (they differ by ₹${(Math.abs(dr - cr) / 100).toFixed(2)}).`;
    else if (!lines.some((l) => l.debitPaise > 0) || !lines.some((l) => l.creditPaise > 0)) errors.lines ??= "An entry needs at least one debit and one credit.";
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, values: { date: date!, narration: narration!, lines } };
}

/* ---------------- Settings ---------------- */

export function validateBooksLock(raw: Record<string, unknown>, today: string): Result<{ booksLockedUntil: string | null }> {
  const r = new FieldReader(raw);
  const d = readDate(r, "booksLockedUntil", null);
  if (d && d > today) r.fail("booksLockedUntil", "You can't close a period that hasn't ended yet. Pick today or an earlier date.");
  if (!r.ok) return { ok: false, errors: r.errors };
  return { ok: true, values: { booksLockedUntil: d } };
}

/* ---------------- Report periods ---------------- */

/** First and last day of the financial year containing `date` (start month 1–12). */
export function financialYearRange(date: string, startMonth: number): { from: string; to: string; label: string } {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const startYear = m >= startMonth ? y : y - 1;
  const from = `${startYear}-${String(startMonth).padStart(2, "0")}-01`;
  const end = new Date(Date.UTC(startYear + 1, startMonth - 1, 1) - 86_400_000);
  const to = end.toISOString().slice(0, 10);
  const label = startMonth === 1 ? String(startYear) : `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
  return { from, to, label };
}

/** ?from=&to= (or ?asOf=) from a report URL, defaulting to the current financial year to date. */
export function readPeriod(params: URLSearchParams, today: string, startMonth: number): { from: string; to: string } {
  const fy = financialYearRange(today, startMonth);
  const from = isIsoDate(params.get("from")) ? params.get("from")! : fy.from;
  const to = isIsoDate(params.get("to")) ? params.get("to")! : today;
  return from <= to ? { from, to } : { from: to, to: from };
}

export const readAsOf = (params: URLSearchParams, today: string) => (isIsoDate(params.get("asOf")) ? params.get("asOf")! : today);
