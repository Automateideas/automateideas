// GST rate slabs by effective date. These only drive suggestions in forms;
// the rate actually charged always comes from the product, service or line,
// so a rate change never needs a code change. Confirm slabs with a tax
// adviser before relying on them.

export type RateSchedule = { effectiveFrom: string; rates: readonly string[]; note: string };

export const GST_RATE_SCHEDULES: readonly RateSchedule[] = [
  { effectiveFrom: "2017-07-01", rates: ["0", "0.25", "3", "5", "12", "18", "28"], note: "GST launch slabs" },
  // GST rate rationalisation: 12% and 28% folded into 5% and 18%; 40% for luxury and sin goods.
  // 12% and 28% are still offered for items that keep them during the transition.
  { effectiveFrom: "2025-09-22", rates: ["0", "0.25", "3", "5", "18", "40", "12", "28"], note: "Rationalised slabs" },
];

/** The slabs in force on `date` (YYYY-MM-DD or Date), newest schedule that has started. */
export function gstRatesOn(date: string | Date = new Date()): readonly string[] {
  const day = typeof date === "string" ? date : date.toISOString().slice(0, 10);
  const current = [...GST_RATE_SCHEDULES].reverse().find((s) => s.effectiveFrom <= day) ?? GST_RATE_SCHEDULES[0];
  return [...current.rates].sort((a, b) => Number(a) - Number(b));
}
