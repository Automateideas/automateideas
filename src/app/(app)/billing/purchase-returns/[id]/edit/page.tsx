import type { Metadata } from "next";

import { DocumentEditorPage } from "../../../_components/documents/document-editor";

export const metadata: Metadata = {
  title: "Edit purchase return · Billing",
};

export default async function Page({ params }: PageProps<"/billing/purchase-returns/[id]/edit">) {
  const { id } = await params;
  return <DocumentEditorPage key={id} slug="purchase-returns" id={id} />;
}
