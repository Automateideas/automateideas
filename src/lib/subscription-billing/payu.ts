import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { type BillingCycle, type PlanId, DEFAULT_PLAN, PLANS, periodTotalInr } from "./plans";

// PayU Hosted Checkout with a standing instruction (si=1), so the first
// payment also registers a monthly or yearly mandate for the plan's price × seats.
// Formulas: https://docs.payu.in/docs/payu-hosted-integration-subscriptions

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}

const sha512 = (s: string) => createHash("sha512").update(s).digest("hex");

/** Marks checkouts started by POST /api/subscription/seats, so the webhook knows what it's looking at. */
export const SEAT_CHECKOUT_TAG = "seat_change";

export function buildSeatCheckout(input: {
  organizationId: string;
  seats: number;
  /** Defaults keep older callers on Starter, monthly. */
  planId?: PlanId;
  billingCycle?: BillingCycle;
  firstname: string;
  email: string;
  phone?: string;
  surl: string;
  furl: string;
}) {
  const key = env("PAYU_KEY");
  const salt = env("PAYU_SALT");

  const plan = PLANS[input.planId ?? DEFAULT_PLAN];
  const cycle = input.billingCycle ?? "monthly";
  const amount = periodTotalInr(plan, cycle, input.seats).toFixed(2);
  // PayU allows at most 25 characters and the id must never repeat.
  const txnid = `seat${Date.now().toString(36)}${randomBytes(4).toString("hex")}`;
  const productinfo = `${plan.name}, ${input.seats} seats (${cycle})`;

  const today = new Date();
  const end = new Date(today);
  end.setFullYear(end.getFullYear() + 5);
  const day = (d: Date) => d.toISOString().slice(0, 10);

  const si_details = JSON.stringify({
    billingAmount: amount,
    billingCurrency: "INR",
    billingCycle: cycle === "yearly" ? "YEARLY" : "MONTHLY",
    billingInterval: 1,
    paymentStartDate: day(today),
    paymentEndDate: day(end),
  });

  // udf1..udf5 travel back in the webhook and are covered by the hash.
  const udf1 = input.organizationId;
  const udf2 = String(input.seats);
  const udf3 = SEAT_CHECKOUT_TAG;
  const udf4 = plan.id;
  const udf5 = cycle;

  // key|txnid|amount|productinfo|firstname|email|udf1..udf5||||||si_details|SALT
  const hash = sha512(
    [key, txnid, amount, productinfo, input.firstname, input.email,
      udf1, udf2, udf3, udf4, udf5, "", "", "", "", "", si_details, salt].join("|"),
  );

  return {
    action: process.env.PAYU_BASE_URL ?? "https://test.payu.in/_payment",
    fields: {
      key, txnid, amount, productinfo,
      firstname: input.firstname,
      email: input.email,
      phone: input.phone ?? "",
      surl: input.surl,
      furl: input.furl,
      udf1, udf2, udf3, udf4, udf5,
      api_version: "7",
      si: "1",
      si_details,
      hash,
    },
  };
}

/**
 * Checks the reverse hash PayU sends on responses and webhooks:
 * [additional_charges|]SALT|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key
 */
export function verifyPayuHash(p: Record<string, string>) {
  const key = env("PAYU_KEY");
  const salt = env("PAYU_SALT");
  if (!p.hash || p.key !== key) return false;

  const parts = [
    salt, p.status ?? "", "", "", "", "", "",
    p.udf5 ?? "", p.udf4 ?? "", p.udf3 ?? "", p.udf2 ?? "", p.udf1 ?? "",
    p.email ?? "", p.firstname ?? "", p.productinfo ?? "",
    p.amount ?? "", p.txnid ?? "", key,
  ];
  if (p.additional_charges) parts.unshift(p.additional_charges);

  const expected = Buffer.from(sha512(parts.join("|")), "utf8");
  const received = Buffer.from(p.hash.toLowerCase(), "utf8");
  return expected.length === received.length && timingSafeEqual(expected, received);
}
