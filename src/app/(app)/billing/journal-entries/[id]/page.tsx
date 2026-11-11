import type { Metadata } from "next";

import { JournalEntryView } from "../../_components/accounting";

export const metadata: Metadata = {
  title: "Journal entry · Billing",
};

export default async function Page({ params }: PageProps<"/billing/journal-entries/[id]">) {
  const { id } = await params;
  return <JournalEntryView key={id} id={id} />;
}
