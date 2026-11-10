/**
 * Tinted icon chips in the brand colours, as on the login page's product preview.
 * Each colour has one meaning wherever it appears in the app:
 *
 * - green: selling and money coming in (invoices, quotations, payments, customers)
 * - amber: buying and the people you buy from (suppliers, purchases), and your team
 * - red:   what you sell (products, services)
 * - ink:   everything else (reports, settings)
 */
export const BRAND_TONES = {
  green: "bg-brand-green/10 text-brand-green",
  amber: "bg-brand-amber/15 text-brand-amber",
  red: "bg-brand-red/10 text-brand-red",
  ink: "bg-muted text-foreground",
} as const;

export type BrandTone = keyof typeof BRAND_TONES;
