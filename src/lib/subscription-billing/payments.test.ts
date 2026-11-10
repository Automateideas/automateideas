import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));

import { amountToPaise, paymentFromPayu } from "./payments";

describe("amountToPaise", () => {
  it("converts PayU amount strings exactly", () => {
    expect(amountToPaise("700.00")).toBe(70000);
    expect(amountToPaise("700")).toBe(70000);
    expect(amountToPaise("0.1")).toBe(10);
    expect(amountToPaise("1234.56")).toBe(123456);
    // 0.29 * 100 is 28.999999999999996 in floating point; the string parse isn't.
    expect(amountToPaise("0.29")).toBe(29);
  });

  it("rejects anything that isn't a plain amount", () => {
    expect(amountToPaise("")).toBeNull();
    expect(amountToPaise("-5.00")).toBeNull();
    expect(amountToPaise("1.234")).toBeNull();
    expect(amountToPaise("abc")).toBeNull();
  });
});

describe("paymentFromPayu", () => {
  const base = {
    txnid: "seat123",
    status: "success",
    amount: "700.00",
    mihpayid: "403993715525331373",
    productinfo: "7 seats (monthly)",
    mode: "UPI",
    error: "E000",
    error_Message: "No Error",
    // Present in real webhooks; must not end up in the record.
    cardnum: "512345XXXXXX2346",
    hash: "abc",
  };

  it("keeps what the history needs and nothing sensitive", () => {
    expect(paymentFromPayu(base, "org_1", 7)).toEqual({
      organizationId: "org_1",
      txnid: "seat123",
      providerPaymentId: "403993715525331373",
      status: "success",
      seats: 7,
      planId: null,
      billingCycle: null,
      amountPaise: 70000,
      description: "7 seats (monthly)",
      paymentMode: "UPI",
      errorMessage: null,
    });
  });

  it("keeps the plan and cycle the checkout carried", () => {
    const record = paymentFromPayu({ ...base, udf4: "pro", udf5: "yearly" }, "org_1", 7);
    expect(record?.planId).toBe("pro");
    expect(record?.billingCycle).toBe("yearly");
    expect(paymentFromPayu({ ...base, udf4: "bogus", udf5: "weekly" }, "org_1", 7)?.planId).toBeNull();
  });

  it("keeps PayU's reason for a failed payment", () => {
    const record = paymentFromPayu(
      { ...base, status: "failure", error: "E308", error_Message: "Transaction declined by bank" },
      "org_1",
      7,
    );
    expect(record?.status).toBe("failure");
    expect(record?.errorMessage).toBe("Transaction declined by bank");
  });

  it("returns null without a txnid, status or valid amount", () => {
    expect(paymentFromPayu({ ...base, txnid: "" }, "org_1", 7)).toBeNull();
    expect(paymentFromPayu({ ...base, status: "" }, "org_1", 7)).toBeNull();
    expect(paymentFromPayu({ ...base, amount: "x" }, "org_1", 7)).toBeNull();
  });
});
