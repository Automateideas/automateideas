import type { Metadata } from "next";

import { DocumentView } from "../../_components/documents/documents-ui";

export const metadata: Metadata = {
  title: "Quotation · Billing",
};

export default async function Page({ params }: PageProps<"/billing/quotations/[id]">) {
  const { id } = await params;
  return <DocumentView key={id} slug="quotations" id={id} />;
}
