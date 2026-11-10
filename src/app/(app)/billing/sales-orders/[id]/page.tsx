import type { Metadata } from "next";

import { DocumentView } from "../../_components/documents/documents-ui";

export const metadata: Metadata = {
  title: "Sales order · Billing",
};

export default async function Page({ params }: PageProps<"/billing/sales-orders/[id]">) {
  const { id } = await params;
  return <DocumentView key={id} slug="sales-orders" id={id} />;
}
