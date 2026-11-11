import type { Metadata } from "next";

import { JournalEntryForm } from "../../_components/accounting";

export const metadata: Metadata = {
  title: "New journal entry · Billing",
};

export default function Page() {
  return <JournalEntryForm />;
}
