import type { Metadata } from "next";

import { SubscriptionSettingsView } from "../_components/settings-view";

export const metadata: Metadata = {
  title: "Subscription settings",
};

export default function Page() {
  return <SubscriptionSettingsView />;
}
