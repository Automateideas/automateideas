import type { Metadata } from "next";

import { ReportsHome } from "../_components/reports-ui";

export const metadata: Metadata = {
  title: "Reports · Billing",
};

export default function Page() {
  return <ReportsHome />;
}
