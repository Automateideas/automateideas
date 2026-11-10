import type { Metadata } from "next";

import { DocumentView } from "../../_components/documents/documents-ui";

export const metadata: Metadata = {
  title: "Invoice · Billing",
};

export default async function Page({ params }: PageProps<"/billing/invoices/[id]">) {
  const { id } = await params;
  return <DocumentView key={id} slug="invoices" id={id} />;
}
