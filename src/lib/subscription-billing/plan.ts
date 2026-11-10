// Trial and seat rules. Plan prices, features and limits live in plans.ts.
export const TRIAL_SEATS = 5;
export const TRIAL_DAYS = 14;
export const MAX_SEATS = 10_000;

export type PlanStatus = "trialing" | "active" | "past_due" | "canceled";

export function trialEndDate(from = new Date()) {
  return new Date(from.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
}
