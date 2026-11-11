import type { Metadata } from "next";

import { JournalList } from "../_components/accounting";

export const metadata: Metadata = {
  title: "Journal entries · Billing",
};

export default function Page() {
  return <JournalList />;
}
