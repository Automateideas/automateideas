import type { Metadata } from "next";

import { PlansView } from "../_components/subscription-view";

export const metadata: Metadata = {
  title: "Plans",
};

export default function Page() {
  return <PlansView />;
}
