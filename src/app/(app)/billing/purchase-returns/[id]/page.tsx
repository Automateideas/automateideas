import type { Metadata } from "next";

import { DocumentView } from "../../_components/documents/documents-ui";

export const metadata: Metadata = {
  title: "Purchase return · Billing",
};

export default async function Page({ params }: PageProps<"/billing/purchase-returns/[id]">) {
  const { id } = await params;
  return <DocumentView key={id} slug="purchase-returns" id={id} />;
}
