import { Suspense } from "react";
import type { Metadata } from "next";

import { LedgerView } from "../_components/accounting";
import { ListSkeleton } from "../_components/records-ui";

export const metadata: Metadata = {
  title: "Ledger · Billing",
};

// ?accountId= picks the account; it's read in the browser, so the page streams behind a skeleton.
export default function Page() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <LedgerView />
    </Suspense>
  );
}
