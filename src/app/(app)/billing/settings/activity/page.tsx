import type { Metadata } from "next";

import { ActivityLog } from "../../_components/activity-ui";

export const metadata: Metadata = {
  title: "Activity · Billing",
};

export default function Page() {
  return <ActivityLog />;
}
