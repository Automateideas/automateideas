import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";

import { SEAT_CHECKOUT_TAG, buildSeatCheckout, verifyPayuHash } from "./payu";

const sha512 = (s: string) => createHash("sha512").update(s).digest("hex");

beforeEach(() => {
  process.env.PAYU_KEY = "testkey";
  process.env.PAYU_SALT = "testsalt";
  delete process.env.PAYU_BASE_URL;
});

const checkoutInput = {
  organizationId: "org_1",
  seats: 7,
  firstname: "Amit",
  email: "a@b.com",
  surl: "https://app/return",
  furl: "https://app/return",
};

// A PayU response for `fields`, signed the way PayU signs it.
function signedResponse(fields: Record<string, string>, status = "success") {
  const p: Record<string, string> = {
    key: "testkey",
    txnid: fields.txnid,
    amount: fields.amount,
    productinfo: fields.productinfo,
    firstname: fields.firstname,
    email: fields.email,
    udf1: fields.udf1,
    udf2: fields.udf2,
    udf3: fields.udf3,
    udf4: fields.udf4,
    udf5: fields.udf5,
    status,
    mihpayid: "403993715525331373",
  };
  p.hash = sha512(
    `testsalt|${status}||||||${p.udf5}|${p.udf4}|${p.udf3}|${p.udf2}|${p.udf1}|${p.email}|${p.firstname}|${p.productinfo}|${p.amount}|${p.txnid}|testkey`,
  );
  return p;
}

describe("buildSeatCheckout", () => {
  it("charges seats × Rs 100 and tags the checkout with org and seats", () => {
    const { action, fields } = buildSeatCheckout(checkoutInput);
    expect(action).toBe("https://test.payu.in/_payment");
    expect(fields.amount).toBe("700.00");
    expect(fields.udf1).toBe("org_1");
    expect(fields.udf2).toBe("7");
    expect(fields.udf3).toBe(SEAT_CHECKOUT_TAG);
    expect(fields.si).toBe("1");
    expect(fields.txnid.length).toBeLessThanOrEqual(25);
    expect(JSON.parse(fields.si_details)).toMatchObject({
      billingAmount: "700.00",
      billingCycle: "MONTHLY",
      billingInterval: 1,
    });
  });

  it("signs the request with PayU's si_details hash formula", () => {
    const { fields: f } = buildSeatCheckout(checkoutInput);
    const expected = sha512(
      `testkey|${f.txnid}|${f.amount}|${f.productinfo}|${f.firstname}|${f.email}|org_1|7|${SEAT_CHECKOUT_TAG}|starter|monthly||||||${f.si_details}|testsalt`,
    );
    expect(f.hash).toBe(expected);
  });

  it("charges the plan and cycle, and carries them back in udf4/udf5", () => {
    const { fields } = buildSeatCheckout({ ...checkoutInput, seats: 3, planId: "pro", billingCycle: "yearly" });
    expect(fields.amount).toBe("6000.00"); // Rs 200 x 10 months x 3 seats
    expect(fields.udf4).toBe("pro");
    expect(fields.udf5).toBe("yearly");
    expect(fields.productinfo).toBe("Pro, 3 seats (yearly)");
    expect(JSON.parse(fields.si_details)).toMatchObject({ billingAmount: "6000.00", billingCycle: "YEARLY" });
  });

  it("uses PAYU_BASE_URL when set", () => {
    process.env.PAYU_BASE_URL = "https://secure.payu.in/_payment";
    expect(buildSeatCheckout(checkoutInput).action).toBe("https://secure.payu.in/_payment");
  });
});

describe("verifyPayuHash", () => {
  const { fields } = (() => {
    process.env.PAYU_KEY = "testkey";
    process.env.PAYU_SALT = "testsalt";
    return buildSeatCheckout(checkoutInput);
  })();

  it("accepts a correctly signed response", () => {
    expect(verifyPayuHash(signedResponse(fields))).toBe(true);
    expect(verifyPayuHash(signedResponse(fields, "failure"))).toBe(true);
  });

  it("rejects a tampered seat count, amount or status", () => {
    const p = signedResponse(fields);
    expect(verifyPayuHash({ ...p, udf2: "70" })).toBe(false);
    expect(verifyPayuHash({ ...p, amount: "1.00" })).toBe(false);
    expect(verifyPayuHash({ ...p, status: "failure" })).toBe(false);
  });

  it("rejects another merchant's key and a missing hash", () => {
    const p = signedResponse(fields);
    expect(verifyPayuHash({ ...p, key: "other" })).toBe(false);
    expect(verifyPayuHash({ ...p, hash: "" })).toBe(false);
  });

  it("includes additional_charges when PayU sends it", () => {
    const p = signedResponse(fields);
    p.additional_charges = "10.00";
    p.hash = sha512(
      `10.00|testsalt|success||||||${p.udf5}|${p.udf4}|${p.udf3}|${p.udf2}|${p.udf1}|${p.email}|${p.firstname}|${p.productinfo}|${p.amount}|${p.txnid}|testkey`,
    );
    expect(verifyPayuHash(p)).toBe(true);
  });
});
