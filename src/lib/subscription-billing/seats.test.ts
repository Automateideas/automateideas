import { afterEach, describe, expect, it, vi } from "vitest";

// planBlockReason is pure; stub the database module that seats.ts imports.
vi.mock("@/db", () => ({ db: {} }));

import { planBlockReason, type SeatUsage } from "./seats";

const DAY = 86_400_000;
const usage = (over: Partial<SeatUsage>): SeatUsage => ({
  seatLimit: 5,
  planStatus: "trialing",
  trialEndsAt: new Date(Date.now() + DAY),
  subscriptionId: null,
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  members: 1,
  pendingInvites: 0,
  used: 1,
  ...over,
});

afterEach(() => {
  delete process.env.PAYU_KEY;
  delete process.env.PAYU_SALT;
});

function paymentsOn() {
  process.env.PAYU_KEY = "k";
  process.env.PAYU_SALT = "s";
}

describe("planBlockReason", () => {
  it("never blocks while payments are off", () => {
    expect(planBlockReason(usage({ planStatus: "canceled" }))).toBeNull();
    expect(planBlockReason(usage({ trialEndsAt: new Date(0) }))).toBeNull();
  });

  it("allows an active plan and a running trial", () => {
    paymentsOn();
    expect(planBlockReason(usage({ planStatus: "active" }))).toBeNull();
    expect(planBlockReason(usage({ planStatus: "trialing" }))).toBeNull();
  });

  it("allows invites during the 14-day grace period after a trial", () => {
    paymentsOn();
    expect(planBlockReason(usage({ trialEndsAt: new Date(Date.now() - 3 * DAY) }))).toBeNull();
  });

  it("blocks once the workspace is read-only", () => {
    paymentsOn();
    expect(planBlockReason(usage({ trialEndsAt: new Date(Date.now() - 15 * DAY) }))).toMatch(/trial has ended/);
    expect(planBlockReason(usage({ planStatus: "past_due" }))).toMatch(/payment failed/);
    expect(planBlockReason(usage({ planStatus: "canceled" }))).toMatch(/canceled/);
  });
});
