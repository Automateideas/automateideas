import type { Metadata } from "next";

import { RecurringList } from "../_components/recurring-ui";

export const metadata: Metadata = {
  title: "Recurring invoices · Billing",
};

export default function Page() {
  return <RecurringList />;
}
