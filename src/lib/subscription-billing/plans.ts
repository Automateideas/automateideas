import { MAX_SEATS } from "./plan";

// SaaS subscription plans: what Automate Ideas charges a workspace.
// DRAFT values for review. Change prices, limits and features here only;
// the APIs, checks and pages all read from this file.

export const PLAN_IDS = ["starter", "pro"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export const BILLING_CYCLES = ["monthly", "yearly"] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

/** Yearly billing = this many months of the monthly price (2 months free). */
export const YEARLY_MONTHS_CHARGED = 10;

/** After a trial or paid period ends unpaid: full access this long, then read-only. */
export const GRACE_DAYS = 14;

/** Features a plan can switch on. Checked on the server; pages only hide what's off. */
export type PlanFeatures = {
  billing: boolean;
  inventory: boolean;
  whatsapp: boolean;
  advancedReports: boolean;
};

/** Usage caps. null = no cap. */
export type PlanLimits = {
  maxSeats: number;
  maxInvoicesPerMonth: number | null;
};

export type Plan = {
  id: PlanId;
  name: string;
  description: string;
  monthlyPricePerSeatInr: number;
  features: PlanFeatures;
  limits: PlanLimits;
};

export const PLANS: Record<PlanId, Plan> = {
  starter: {
    id: "starter",
    name: "Starter",
    description: "For small teams getting started with billing.",
    monthlyPricePerSeatInr: 100,
    features: { billing: true, inventory: false, whatsapp: false, advancedReports: false },
    limits: { maxSeats: 10, maxInvoicesPerMonth: 500 },
  },
  pro: {
    id: "pro",
    name: "Pro",
    description: "Every feature, no invoice cap, for growing teams.",
    monthlyPricePerSeatInr: 200,
    features: { billing: true, inventory: true, whatsapp: true, advancedReports: true },
    limits: { maxSeats: MAX_SEATS, maxInvoicesPerMonth: null },
  },
};

/** Plan for workspaces that never chose one (existing workspaces included). */
export const DEFAULT_PLAN: PlanId = "starter";
/** A free trial gets this plan's features, so people can try everything. */
export const TRIAL_PLAN: PlanId = "pro";

export const isPlanId = (v: unknown): v is PlanId => typeof v === "string" && (PLAN_IDS as readonly string[]).includes(v);
export const isBillingCycle = (v: unknown): v is BillingCycle =>
  typeof v === "string" && (BILLING_CYCLES as readonly string[]).includes(v);

/** The plan for a stored id, falling back to the default for unknown values. */
export const planFor = (id: string | null | undefined): Plan => PLANS[isPlanId(id) ? id : DEFAULT_PLAN];

/** Price per seat for one billing period. */
export function pricePerSeatInr(plan: Plan, cycle: BillingCycle) {
  return cycle === "yearly" ? plan.monthlyPricePerSeatInr * YEARLY_MONTHS_CHARGED : plan.monthlyPricePerSeatInr;
}

/** Total for one billing period. */
export function periodTotalInr(plan: Plan, cycle: BillingCycle, seats: number) {
  return pricePerSeatInr(plan, cycle) * seats;
}

/** End of a period that starts at `from`. Month-end safe: 31 Jan + 1 month = 28/29 Feb. */
export function periodEnd(cycle: BillingCycle, from = new Date()) {
  const end = new Date(from);
  if (cycle === "yearly") {
    end.setUTCFullYear(end.getUTCFullYear() + 1);
    if (end.getUTCMonth() !== from.getUTCMonth()) end.setUTCDate(0); // 29 Feb → 28 Feb
  } else {
    const day = end.getUTCDate();
    end.setUTCDate(1);
    end.setUTCMonth(end.getUTCMonth() + 1);
    const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
    end.setUTCDate(Math.min(day, lastDay));
  }
  return end;
}
