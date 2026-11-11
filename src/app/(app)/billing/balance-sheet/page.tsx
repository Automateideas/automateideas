import type { Metadata } from "next";

import { BalanceSheetView } from "../_components/accounting";

export const metadata: Metadata = {
  title: "Balance sheet · Billing",
};

export default function Page() {
  return <BalanceSheetView />;
}
