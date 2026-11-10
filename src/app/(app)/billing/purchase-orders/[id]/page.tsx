import type { Metadata } from "next";

import { DocumentView } from "../../_components/documents/documents-ui";

export const metadata: Metadata = {
  title: "Purchase order · Billing",
};

export default async function Page({ params }: PageProps<"/billing/purchase-orders/[id]">) {
  const { id } = await params;
  return <DocumentView key={id} slug="purchase-orders" id={id} />;
}
