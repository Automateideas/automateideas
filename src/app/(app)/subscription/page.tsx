import type { Metadata } from "next";

import { SubscriptionOverview } from "./_components/subscription-view";

export const metadata: Metadata = {
  title: "Plan & seats",
};

export default function Page() {
  return <SubscriptionOverview />;
}
