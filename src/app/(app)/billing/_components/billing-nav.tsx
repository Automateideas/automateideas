"use client";

import { SectionNav } from "../../_components/section-nav";
import { BILLING_NAV } from "./sections";

/** Section tabs for /billing/*. */
export function BillingNav() {
  return <SectionNav label="Billing" links={BILLING_NAV} />;
}
