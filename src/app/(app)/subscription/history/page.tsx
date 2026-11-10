import type { Metadata } from "next";

import { HistoryView } from "../_components/payments-view";

export const metadata: Metadata = {
  title: "Subscription history",
};

export default function Page() {
  return <HistoryView />;
}
