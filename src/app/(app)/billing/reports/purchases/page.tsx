import { Suspense } from "react";
import type { Metadata } from "next";

import { ListSkeleton } from "../../_components/records-ui";
import { ReportGroupView } from "../../_components/reports-ui";

export const metadata: Metadata = {
  title: "Purchases reports · Billing",
};

// ?report= picks the report; the filters live in the URL too, read in the browser.
export default function Page() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <ReportGroupView group="purchases" />
    </Suspense>
  );
}
