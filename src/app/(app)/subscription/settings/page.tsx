import type { Metadata } from "next";

import { SubscriptionSettingsView } from "../_components/settings-view";

export const metadata: Metadata = {
  title: "Plan settings",
};

export default function Page() {
  return <SubscriptionSettingsView />;
}
