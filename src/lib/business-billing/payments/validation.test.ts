import { describe, expect, it } from "vitest";

import { statusFor } from "./balances";
import { readIdempotencyKey, validatePayment, validateRefund } from "./validation";

const base = { customerId: "c1", paymentDate: "2026-11-12", amount: "1,500.50", method: "upi" };

describe("validatePayment", () => {
  it("reads amounts in paise and drops empty allocations", () => {
    const r = validatePayment({ ...base, allocations: [{ invoiceId: "i1", amount: "1000" }, { invoiceId: "i2", amount: "" }] });
    expect(r.ok && r.values).toMatchObject({ amountPaise: 150050, method: "upi", allocations: [{ invoiceId: "i1", amountPaise: 100000 }] });
  });

  it("needs a positive amount, a known method and a reference for cheques and transfers", () => {
    const zero = validatePayment({ ...base, amount: "0" });
    expect(!zero.ok && zero.errors.amount).toBeTruthy();
    expect(validatePayment({ ...base, method: "bitcoin" }).ok).toBe(false);
    const cheque = validatePayment({ ...base, method: "cheque" });
    expect(!cheque.ok && cheque.errors.reference).toMatch(/cheque number/);
    expect(validatePayment({ ...base, method: "cash" }).ok).toBe(true);
  });

  it("refuses allocating more than received, and the same invoice twice", () => {
    const over = validatePayment({ ...base, allocations: [{ invoiceId: "i1", amount: "2000" }] });
    expect(!over.ok && over.errors.allocations).toBeTruthy();
    const twice = validatePayment({ ...base, allocations: [{ invoiceId: "i1", amount: "1" }, { invoiceId: "i1", amount: "1" }] });
    expect(!twice.ok && twice.errors["allocations.1.invoiceId"]).toBeTruthy();
  });
});

describe("validateRefund", () => {
  it("needs exactly one source", () => {
    const r = { customerId: "c1", refundDate: "2026-11-12", amount: "10", method: "cash" };
    expect(validateRefund({ ...r, paymentId: "p1" }).ok).toBe(true);
    expect(validateRefund(r).ok).toBe(false);
    expect(validateRefund({ ...r, paymentId: "p1", creditNoteId: "c1" }).ok).toBe(false);
  });
});

describe("idempotency keys", () => {
  it("accepts UUID-like keys only", () => {
    expect(readIdempotencyKey("3f1c2a9e-7b1d-4c2e-9f00-123456789abc")).toBe("3f1c2a9e-7b1d-4c2e-9f00-123456789abc");
    expect(readIdempotencyKey("short")).toBeNull();
    expect(readIdempotencyKey("bad key with spaces!")).toBeNull();
    expect(readIdempotencyKey(null)).toBeNull();
  });
});

describe("invoice payment status", () => {
  const b = (balance: number, paid: number, credited = 0) => ({ id: "i", number: "1", status: "issued", customerId: "c", issueDate: "", dueDate: null, totalPaise: 1000, debitedPaise: 0, creditedPaise: credited, paidPaise: paid, creditRefundedPaise: 0, balancePaise: balance });
  it("is paid, partly paid or issued from the balance", () => {
    expect(statusFor(b(0, 1000))).toBe("paid");
    expect(statusFor(b(-50, 1000, 50))).toBe("paid");
    expect(statusFor(b(400, 600))).toBe("partially_paid");
    expect(statusFor(b(900, 0, 100))).toBe("partially_paid");
    expect(statusFor(b(1000, 0))).toBe("issued");
  });
});
