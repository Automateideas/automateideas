import type { Metadata } from "next";

import { ChartOfAccountsView } from "../_components/accounting";

export const metadata: Metadata = {
  title: "Chart of accounts · Billing",
};

export default function Page() {
  return <ChartOfAccountsView />;
}
