import type { Metadata } from "next";

import { DocumentView } from "../../_components/documents/documents-ui";

export const metadata: Metadata = {
  title: "Credit note · Billing",
};

export default async function Page({ params }: PageProps<"/billing/credit-notes/[id]">) {
  const { id } = await params;
  return <DocumentView key={id} slug="credit-notes" id={id} />;
}
