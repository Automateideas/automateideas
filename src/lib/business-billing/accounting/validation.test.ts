import { describe, expect, it } from "vitest";

import { SYSTEM_ACCOUNTS, cashAccountFor, normalBalance } from "./chart";
import { financialYearRange, readPeriod, validateAccount, validateBooksLock, validateJournal } from "./validation";

describe("chart", () => {
  it("has unique keys and codes", () => {
    expect(new Set(SYSTEM_ACCOUNTS.map((a) => a.key)).size).toBe(SYSTEM_ACCOUNTS.length);
    expect(new Set(SYSTEM_ACCOUNTS.map((a) => a.code)).size).toBe(SYSTEM_ACCOUNTS.length);
  });

  it("reads balances on the normal side", () => {
    expect(normalBalance("asset", 500, 200)).toBe(300);
    expect(normalBalance("income", 200, 500)).toBe(300);
    expect(normalBalance("liability", 500, 200)).toBe(-300);
    expect(cashAccountFor("cash")).toBe("cash");
    expect(cashAccountFor("upi")).toBe("bank");
  });
});

describe("validateAccount", () => {
  it("accepts a code, name and type", () => {
    expect(validateAccount({ code: "6100", name: " Rent ", type: "expense" })).toEqual({ ok: true, values: { code: "6100", name: "Rent", type: "expense", parentId: null } });
  });
  it("rejects spaces in codes and unknown types", () => {
    const r = validateAccount({ code: "61 00", name: "Rent", type: "cost" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["code", "type"]);
  });
});

describe("validateJournal", () => {
  const ok = { date: "2026-11-10", narration: "Rent", lines: [{ accountId: "a", debit: "1,000.50" }, { accountId: "b", credit: "1000.5" }, {}] };

  it("reads rupees as paise and drops blank rows", () => {
    const r = validateJournal(ok);
    expect(r.ok && r.values.lines.map((l) => [l.debitPaise, l.creditPaise])).toEqual([[100050, 0], [0, 100050]]);
  });

  it("needs two lines, balanced, with a debit and a credit", () => {
    const one = validateJournal({ ...ok, lines: [{ accountId: "a", debit: "1" }] });
    expect(!one.ok && one.errors.lines).toMatch(/at least two/);
    const off = validateJournal({ ...ok, lines: [{ accountId: "a", debit: "1" }, { accountId: "b", credit: "2" }] });
    expect(!off.ok && off.errors.lines).toMatch(/differ by ₹1.00/);
    const sameSide = validateJournal({ ...ok, lines: [{ accountId: "a", debit: "1" }, { accountId: "b", debit: "1" }] });
    expect(sameSide.ok).toBe(false);
  });

  it("flags each bad line", () => {
    const r = validateJournal({ ...ok, lines: [{ debit: "5" }, { accountId: "b", credit: "x" }, { accountId: "c", customerId: "c1", supplierId: "s1", debit: "1" }] });
    expect(!r.ok && Object.keys(r.errors).sort()).toEqual(["lines.0.accountId", "lines.1.credit", "lines.2.customerId"]);
  });

  it("needs a date and narration", () => {
    const r = validateJournal({ lines: ok.lines });
    expect(!r.ok && Object.keys(r.errors).sort()).toEqual(["date", "narration"]);
    expect(validateJournal({ ...ok, date: "2026-02-30" }).ok).toBe(false);
  });
});

describe("books lock and periods", () => {
  it("can't close a future date; null reopens", () => {
    expect(validateBooksLock({ booksLockedUntil: "2026-11-12" }, "2026-11-11").ok).toBe(false);
    expect(validateBooksLock({ booksLockedUntil: "2026-03-31" }, "2026-11-11")).toEqual({ ok: true, values: { booksLockedUntil: "2026-03-31" } });
    expect(validateBooksLock({ booksLockedUntil: null }, "2026-11-11")).toEqual({ ok: true, values: { booksLockedUntil: null } });
  });

  it("financial years: April and January starts", () => {
    expect(financialYearRange("2026-11-10", 4)).toEqual({ from: "2026-04-01", to: "2027-03-31", label: "2026-27" });
    expect(financialYearRange("2027-02-15", 4)).toEqual({ from: "2026-04-01", to: "2027-03-31", label: "2026-27" });
    expect(financialYearRange("2026-11-10", 1)).toEqual({ from: "2026-01-01", to: "2026-12-31", label: "2026" });
  });

  it("periods default to this year to date and swap reversed ranges", () => {
    expect(readPeriod(new URLSearchParams(), "2026-11-11", 4)).toEqual({ from: "2026-04-01", to: "2026-11-11" });
    expect(readPeriod(new URLSearchParams({ from: "2026-10-31", to: "2026-10-01" }), "2026-11-11", 4)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(readPeriod(new URLSearchParams({ from: "junk" }), "2026-11-11", 4).from).toBe("2026-04-01");
  });
});
