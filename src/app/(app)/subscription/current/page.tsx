import type { Metadata } from "next";

import { CurrentPlanView } from "../_components/subscription-view";

export const metadata: Metadata = {
  title: "Current plan",
};

export default function Page() {
  return <CurrentPlanView />;
}
