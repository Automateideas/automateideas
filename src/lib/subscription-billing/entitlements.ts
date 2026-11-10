import { and, count, eq, gte, inArray, lt } from "drizzle-orm";
import { APIError } from "better-auth/api";

import { db } from "@/db";
import { businessInvoices, organization } from "@/db/schema";

import { paymentsEnabled } from "./mode";
import type { PlanStatus } from "./plan";
import {
  type BillingCycle,
  GRACE_DAYS,
  type PlanFeatures,
  type PlanId,
  TRIAL_PLAN,
  isBillingCycle,
  planFor,
} from "./plans";

const DAY = 24 * 60 * 60 * 1000;

/**
 * full:      everything works.
 * grace:     a trial or paid period ended unpaid; everything still works for
 *            GRACE_DAYS so the workspace can renew.
 * read_only: data stays viewable and exportable, nothing is deleted; adding
 *            or changing records is blocked until the workspace pays.
 *            Subscription pages always work, so the workspace can renew.
 */
export type AccessState = "full" | "grace" | "read_only";

export type Access = {
  state: AccessState;
  /** Why access isn't full, in words for the workspace. Null when full. */
  reason: string | null;
  /** When grace turns read-only (grace only). */
  readOnlyFrom: Date | null;
};

export type SubscriptionState = {
  planStatus: PlanStatus;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
};

const fmt = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });

/** Access from the subscription's dates. Pure: no database, no clock unless `now` is omitted. */
export function computeAccess(s: SubscriptionState, opts: { paymentsEnabled: boolean; now?: Date }): Access {
  const now = opts.now ?? new Date();
  // Early access (no PayU keys): nothing to pay, so nothing expires.
  if (!opts.paymentsEnabled) return { state: "full", reason: null, readOnlyFrom: null };

  const afterEnd = (end: Date, endedMessage: string, allowGrace = true): Access => {
    if (now < end) return { state: "full", reason: null, readOnlyFrom: null };
    const readOnlyFrom = new Date(end.getTime() + GRACE_DAYS * DAY);
    if (allowGrace && now < readOnlyFrom) {
      return { state: "grace", reason: `${endedMessage} Renew by ${fmt(readOnlyFrom)} to keep full access.`, readOnlyFrom };
    }
    return { state: "read_only", reason: `${endedMessage} Your workspace is read-only until you renew.`, readOnlyFrom: null };
  };

  switch (s.planStatus) {
    case "trialing":
      if (!s.trialEndsAt) return { state: "full", reason: null, readOnlyFrom: null };
      return afterEnd(s.trialEndsAt, "Your free trial has ended.");
    case "active":
      // Older paid workspaces without a period end keep full access.
      if (!s.currentPeriodEnd) return { state: "full", reason: null, readOnlyFrom: null };
      // A deliberate cancellation ends at the period end, without a grace period.
      if (s.cancelAtPeriodEnd) return afterEnd(s.currentPeriodEnd, "Your subscription was canceled.", false);
      return afterEnd(s.currentPeriodEnd, "Your subscription period has ended.");
    case "past_due":
      if (!s.currentPeriodEnd) return { state: "read_only", reason: "Your last payment failed. Your workspace is read-only until you pay.", readOnlyFrom: null };
      return afterEnd(s.currentPeriodEnd, "Your last payment failed.");
    case "canceled":
    default:
      return { state: "read_only", reason: "Your subscription is canceled. Your workspace is read-only until you subscribe again.", readOnlyFrom: null };
  }
}

/** Plan whose features apply: the trial plan while a trial is running. */
export function effectivePlanId(planId: string, planStatus: PlanStatus, trialEndsAt: Date | null, now = new Date()): PlanId {
  if (planStatus === "trialing" && (!trialEndsAt || now < trialEndsAt)) return TRIAL_PLAN;
  return planFor(planId).id;
}

export async function getEntitlements(organizationId: string) {
  const [org] = await db
    .select({
      planId: organization.planId,
      billingCycle: organization.billingCycle,
      planStatus: organization.planStatus,
      trialEndsAt: organization.trialEndsAt,
      currentPeriodEnd: organization.currentPeriodEnd,
      cancelAtPeriodEnd: organization.cancelAtPeriodEnd,
    })
    .from(organization)
    .where(eq(organization.id, organizationId))
    .limit(1);
  if (!org) throw new APIError("NOT_FOUND", { message: "Organization not found." });

  const planStatus = org.planStatus as PlanStatus;
  const plan = planFor(org.planId);
  const effective = planFor(effectivePlanId(plan.id, planStatus, org.trialEndsAt));
  return {
    planId: plan.id,
    effectivePlanId: effective.id,
    billingCycle: (isBillingCycle(org.billingCycle) ? org.billingCycle : "monthly") as BillingCycle,
    planStatus,
    trialEndsAt: org.trialEndsAt,
    currentPeriodEnd: org.currentPeriodEnd,
    cancelAtPeriodEnd: org.cancelAtPeriodEnd,
    features: effective.features,
    limits: effective.limits,
    access: computeAccess({ ...org, planStatus }, { paymentsEnabled: paymentsEnabled() }),
  };
}

export type Entitlements = Awaited<ReturnType<typeof getEntitlements>>;

/** 403 when the workspace is read-only. Use before any write outside /subscription. */
export function assertWritable(e: Pick<Entitlements, "access">) {
  if (e.access.state === "read_only") {
    throw new APIError("FORBIDDEN", { code: "READ_ONLY", message: e.access.reason ?? "Your workspace is read-only." });
  }
}

/** 403 when the workspace's plan doesn't include `feature`. */
export function assertFeature(e: Pick<Entitlements, "features" | "effectivePlanId">, feature: keyof PlanFeatures) {
  if (!e.features[feature]) {
    throw new APIError("FORBIDDEN", {
      code: "FEATURE_NOT_IN_PLAN",
      message: `Your ${planFor(e.effectivePlanId).name} plan doesn't include this. Upgrade to use it.`,
    });
  }
}

/** Start and end (exclusive) of the current calendar month, as YYYY-MM-DD. */
export function monthBounds(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const day = (d: Date) => d.toISOString().slice(0, 10);
  return { start: day(start), end: day(end) };
}

/**
 * 403 when issuing one more invoice this month would pass the plan's cap.
 * Counts issued (non-draft, non-void) invoices dated this month.
 * Called by invoice issuing (built in a later stage).
 */
export async function assertInvoiceQuota(organizationId: string, e: Pick<Entitlements, "limits" | "effectivePlanId">) {
  const cap = e.limits.maxInvoicesPerMonth;
  if (cap === null) return;
  const { start, end } = monthBounds();
  const [{ n }] = await db
    .select({ n: count() })
    .from(businessInvoices)
    .where(
      and(
        eq(businessInvoices.organizationId, organizationId),
        inArray(businessInvoices.status, ["issued", "partially_paid", "paid"]),
        gte(businessInvoices.issueDate, start),
        lt(businessInvoices.issueDate, end),
      ),
    );
  if (n >= cap) {
    throw new APIError("FORBIDDEN", {
      code: "INVOICE_LIMIT_REACHED",
      message: `Your ${planFor(e.effectivePlanId).name} plan allows ${cap} invoices a month, and you've used them all. Upgrade for more.`,
    });
  }
}
