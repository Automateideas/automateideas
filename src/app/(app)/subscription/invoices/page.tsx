import type { Metadata } from "next";

import { InvoicesView } from "../_components/payments-view";

export const metadata: Metadata = {
  title: "Invoices",
};

export default function Page() {
  return <InvoicesView />;
}
