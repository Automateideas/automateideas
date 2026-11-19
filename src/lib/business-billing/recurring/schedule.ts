import { FieldReader, type FieldErrors } from "../fields";

// When a recurring invoice runs. Pure: the form checks with it and the
// server computes dates with it.

export const FREQUENCIES = ["weekly", "monthly", "quarterly", "yearly"] as const;
export type Frequency = (typeof FREQUENCIES)[number];
export const FREQUENCY_LABELS: Record<Frequency, string> = { weekly: "Weekly", monthly: "Monthly", quarterly: "Quarterly", yearly: "Yearly" };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (v: string) => DATE_RE.test(v) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v);
const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * The n-th date (n = 0 is the start). Counted from the start date each time,
 * so a schedule on the 31st bills on 30 Apr, then 31 May again, not the 30th forever.
 */
export function occurrence(start: string, frequency: Frequency, interval: number, n: number): string {
  const s = new Date(`${start}T00:00:00Z`);
  if (frequency === "weekly") return iso(new Date(s.getTime() + n * interval * 7 * 86_400_000));
  const months = (frequency === "monthly" ? 1 : frequency === "quarterly" ? 3 : 12) * interval * n;
  const y = s.getUTCFullYear();
  const m = s.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return iso(new Date(Date.UTC(y, m, Math.min(s.getUTCDate(), lastDay))));
}

/** The date after `count` invoices, or null once the end date or the maximum is reached. */
export function nextRun(p: { startDate: string; frequency: Frequency; interval: number; endDate: string | null; maxCount: number | null }, count: number): string | null {
  if (p.maxCount !== null && count >= p.maxCount) return null;
  const d = occurrence(p.startDate, p.frequency, p.interval, count);
  return p.endDate && d > p.endDate ? null : d;
}

const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "Every month on the 5th", "Every 2 weeks on Monday", "Every year on 1 April". */
export function describeSchedule(frequency: Frequency, interval: number, startDate: string): string {
  const d = new Date(`${startDate}T00:00:00Z`);
  const day = d.getUTCDate();
  const on = day >= 29 && frequency !== "weekly" && frequency !== "yearly" ? `on the ${ordinal(day)} (or the last day of shorter months)` : `on the ${ordinal(day)}`;
  if (frequency === "weekly") return interval === 1 ? `Every week on ${WEEKDAYS[d.getUTCDay()]}` : `Every ${interval} weeks on ${WEEKDAYS[d.getUTCDay()]}`;
  if (frequency === "monthly") return interval === 1 ? `Every month ${on}` : `Every ${interval} months ${on}`;
  if (frequency === "quarterly") return interval === 1 ? `Every 3 months ${on}` : `Every ${3 * interval} months ${on}`;
  return interval === 1 ? `Every year on ${day} ${MONTHS[d.getUTCMonth()]}` : `Every ${interval} years on ${day} ${MONTHS[d.getUTCMonth()]}`;
}

export type ScheduleValues = {
  name: string;
  frequency: Frequency;
  interval: number;
  startDate: string;
  endDate: string | null;
  maxCount: number | null;
  dueDays: number | null;
  autoIssue: boolean;
  autoEmail: boolean;
};

/** { name, frequency, interval, startDate, endDate?, maxCount?, dueDays?, autoIssue, autoEmail } */
export function validateSchedule(raw: Record<string, unknown>): { ok: true; values: ScheduleValues } | { ok: false; errors: FieldErrors } {
  const r = new FieldReader(raw);
  const name = r.text("name", 120, "Give it a name, e.g. Monthly retainer.");
  const frequency = r.oneOf("frequency", FREQUENCIES, "Choose how often.", "monthly");
  const interval = r.int("interval", 1, frequency === "weekly" ? 52 : 12, frequency === "weekly" ? "Enter 1 to 52." : "Enter 1 to 12.", true);
  const startDate = r.text("startDate", 10, "Choose the first invoice date.");
  if (startDate && !isDate(startDate)) r.fail("startDate", "Enter a date as YYYY-MM-DD.");
  const endDate = r.text("endDate", 10);
  if (endDate && !isDate(endDate)) r.fail("endDate", "Enter a date as YYYY-MM-DD.");
  else if (endDate && startDate && endDate < startDate) r.fail("endDate", "The end date can't be before the start.");
  const maxCount = r.int("maxCount", 1, 1000, "Enter 1 to 1000, or leave blank for no limit.");
  const dueDays = r.int("dueDays", 0, 365, "Enter 0 to 365 days, or leave blank for the customer's terms.");
  const autoIssue = r.bool("autoIssue", true);
  const autoEmail = r.bool("autoEmail", false);
  if (autoEmail && !autoIssue) r.fail("autoEmail", "Only issued invoices can be emailed. Turn on “Issue automatically” too.");
  if (!r.ok) return { ok: false, errors: r.errors };
  return { ok: true, values: { name: name!, frequency, interval: interval!, startDate: startDate!, endDate, maxCount, dueDays, autoIssue, autoEmail } };
}

/** Invoice date + days, as YYYY-MM-DD. */
export const addDays = (date: string, days: number) => iso(new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000));
