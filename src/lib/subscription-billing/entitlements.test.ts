import { describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));

import { assertFeature, assertWritable, computeAccess, effectivePlanId, monthBounds, type SubscriptionState } from "./entitlements";
import { GRACE_DAYS, PLANS, periodEnd, periodTotalInr, planFor, pricePerSeatInr } from "./plans";

const DAY = 86_400_000;
const now = new Date("2026-11-10T12:00:00Z");
const ago = (days: number) => new Date(now.getTime() - days * DAY);
const ahead = (days: number) => new Date(now.getTime() + days * DAY);
const state = (over: Partial<SubscriptionState>): SubscriptionState => ({
  planStatus: "trialing",
  trialEndsAt: ahead(5),
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  ...over,
});
const on = { paymentsEnabled: true, now };

describe("computeAccess", () => {
  it("gives full access to everything while payments are off (early access)", () => {
    expect(computeAccess(state({ planStatus: "canceled" }), { paymentsEnabled: false, now }).state).toBe("full");
  });

  it("trial: full, then 14 days of grace, then read-only", () => {
    expect(computeAccess(state({ trialEndsAt: ahead(1) }), on).state).toBe("full");
    const grace = computeAccess(state({ trialEndsAt: ago(1) }), on);
    expect(grace.state).toBe("grace");
    expect(grace.readOnlyFrom?.getTime()).toBe(ago(1).getTime() + GRACE_DAYS * DAY);
    expect(grace.reason).toMatch(/trial has ended/);
    expect(computeAccess(state({ trialEndsAt: ago(GRACE_DAYS - 1) }), on).state).toBe("grace");
    expect(computeAccess(state({ trialEndsAt: ago(GRACE_DAYS) }), on).state).toBe("read_only");
  });

  it("paid period: full until it ends, then grace, then read-only", () => {
    expect(computeAccess(state({ planStatus: "active", currentPeriodEnd: ahead(10) }), on).state).toBe("full");
    expect(computeAccess(state({ planStatus: "active", currentPeriodEnd: ago(3) }), on).state).toBe("grace");
    expect(computeAccess(state({ planStatus: "active", currentPeriodEnd: ago(20) }), on).state).toBe("read_only");
  });

  it("keeps older paid workspaces without a period end on full access", () => {
    expect(computeAccess(state({ planStatus: "active", currentPeriodEnd: null }), on).state).toBe("full");
  });

  it("canceled at period end: full until then, read-only after, with no grace", () => {
    expect(computeAccess(state({ planStatus: "active", currentPeriodEnd: ahead(2), cancelAtPeriodEnd: true }), on).state).toBe("full");
    const after = computeAccess(state({ planStatus: "active", currentPeriodEnd: ago(1), cancelAtPeriodEnd: true }), on);
    expect(after.state).toBe("read_only");
    expect(after.reason).toMatch(/canceled/);
  });

  it("failed payment: grace from the period end, read-only after", () => {
    expect(computeAccess(state({ planStatus: "past_due", currentPeriodEnd: ago(2) }), on).state).toBe("grace");
    expect(computeAccess(state({ planStatus: "past_due", currentPeriodEnd: ago(30) }), on).state).toBe("read_only");
    expect(computeAccess(state({ planStatus: "past_due" }), on).state).toBe("read_only");
  });

  it("canceled subscriptions are read-only, never deleted", () => {
    const a = computeAccess(state({ planStatus: "canceled" }), on);
    expect(a.state).toBe("read_only");
    expect(a.reason).toMatch(/read-only/);
  });
});

describe("plans", () => {
  it("prices yearly as 10 months (2 months free)", () => {
    expect(pricePerSeatInr(PLANS.starter, "monthly")).toBe(100);
    expect(pricePerSeatInr(PLANS.starter, "yearly")).toBe(1000);
    expect(periodTotalInr(PLANS.pro, "yearly", 3)).toBe(6000);
  });

  it("keeps Starter at the existing Rs 100 per seat per month", () => {
    expect(PLANS.starter.monthlyPricePerSeatInr).toBe(100);
  });

  it("falls back to the default plan for unknown ids", () => {
    expect(planFor("enterprise").id).toBe("starter");
    expect(planFor(null).id).toBe("starter");
  });

  it("gives a running trial the trial plan's features", () => {
    expect(effectivePlanId("starter", "trialing", ahead(3), now)).toBe("pro");
    expect(effectivePlanId("starter", "trialing", ago(1), now)).toBe("starter");
    expect(effectivePlanId("pro", "active", null, now)).toBe("pro");
  });

  it("computes period ends safely across month lengths", () => {
    expect(periodEnd("monthly", new Date("2026-01-31T10:00:00Z")).toISOString()).toBe("2026-02-28T10:00:00.000Z");
    expect(periodEnd("monthly", new Date("2026-03-15T10:00:00Z")).toISOString()).toBe("2026-04-15T10:00:00.000Z");
    expect(periodEnd("monthly", new Date("2026-12-31T10:00:00Z")).toISOString()).toBe("2027-01-31T10:00:00.000Z");
    expect(periodEnd("yearly", new Date("2028-02-29T10:00:00Z")).toISOString()).toBe("2029-02-28T10:00:00.000Z");
    expect(periodEnd("yearly", new Date("2026-11-10T10:00:00Z")).toISOString()).toBe("2027-11-10T10:00:00.000Z");
  });
});

describe("checks", () => {
  it("assertWritable refuses only read-only workspaces", () => {
    expect(() => assertWritable({ access: { state: "grace", reason: "x", readOnlyFrom: null } })).not.toThrow();
    expect(() => assertWritable({ access: { state: "read_only", reason: "Read-only now.", readOnlyFrom: null } })).toThrow(/Read-only now/);
  });

  it("assertFeature refuses features the plan doesn't include", () => {
    expect(() => assertFeature({ features: PLANS.starter.features, effectivePlanId: "starter" }, "billing")).not.toThrow();
    expect(() => assertFeature({ features: PLANS.starter.features, effectivePlanId: "starter" }, "inventory")).toThrow(/Starter plan/);
  });

  it("monthBounds covers the calendar month", () => {
    expect(monthBounds(new Date("2026-12-15T00:00:00Z"))).toMatchObject({ start: "2026-12-01", end: "2027-01-01", label: "December 2026" });
  });

  it("monthBounds uses India's calendar: 00:30 IST on 1 Dec is December", () => {
    const b = monthBounds(new Date("2026-11-30T19:00:00Z"));
    expect(b).toMatchObject({ start: "2026-12-01", end: "2027-01-01" });
    // As instants: midnight IST = 18:30 UTC the day before.
    expect(b.from.toISOString()).toBe("2026-11-30T18:30:00.000Z");
    expect(b.to.toISOString()).toBe("2026-12-31T18:30:00.000Z");
    expect(monthBounds(new Date("2026-11-30T18:29:59Z")).start).toBe("2026-11-01");
  });
});
