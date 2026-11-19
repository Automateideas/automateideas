import type { Metadata } from "next";

import { RecurringView } from "../../_components/recurring-ui";

export const metadata: Metadata = {
  title: "Recurring invoice · Billing",
};

export default async function Page({ params }: PageProps<"/billing/recurring-invoices/[id]">) {
  const { id } = await params;
  return <RecurringView key={id} id={id} />;
}
