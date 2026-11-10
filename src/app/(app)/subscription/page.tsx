import type { Metadata } from "next";

import { SubscriptionOverview } from "./_components/subscription-view";

export const metadata: Metadata = {
  title: "Subscription",
};

export default function Page() {
  return <SubscriptionOverview />;
}
