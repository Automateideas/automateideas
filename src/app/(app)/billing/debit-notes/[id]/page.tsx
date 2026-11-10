import type { Metadata } from "next";

import { DocumentView } from "../../_components/documents/documents-ui";

export const metadata: Metadata = {
  title: "Debit note · Billing",
};

export default async function Page({ params }: PageProps<"/billing/debit-notes/[id]">) {
  const { id } = await params;
  return <DocumentView key={id} slug="debit-notes" id={id} />;
}
