import type { Metadata } from "next";

import { TrialBalanceView } from "../_components/accounting";

export const metadata: Metadata = {
  title: "Trial balance · Billing",
};

export default function Page() {
  return <TrialBalanceView />;
}
