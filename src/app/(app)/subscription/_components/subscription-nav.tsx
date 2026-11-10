"use client";

import { SectionNav } from "../../_components/section-nav";

export const SUBSCRIPTION_SECTIONS = [
  { href: "/subscription", label: "Overview" },
  { href: "/subscription/current", label: "Current plan" },
  { href: "/subscription/plans", label: "Plans" },
  { href: "/subscription/payments", label: "Payments" },
  { href: "/subscription/history", label: "History" },
  { href: "/subscription/invoices", label: "Invoices" },
  { href: "/subscription/settings", label: "Settings" },
] as const;

/** Section tabs for /subscription/*. */
export function SubscriptionNav() {
  return <SectionNav label="Subscription" links={SUBSCRIPTION_SECTIONS} />;
}
