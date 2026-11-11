import type { Metadata } from "next";

import { ProfitLossView } from "../_components/accounting";

export const metadata: Metadata = {
  title: "Profit and loss · Billing",
};

export default function Page() {
  return <ProfitLossView />;
}
