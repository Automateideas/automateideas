import type { Metadata } from "next";

import { BillingOverview } from "./_components/overview-view";

export const metadata: Metadata = {
  title: "Billing",
};

export default function Page() {
  return <BillingOverview />;
}
