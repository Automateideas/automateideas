import type { Metadata } from "next";

import { DocumentEditorPage } from "../../../_components/documents/document-editor";

export const metadata: Metadata = {
  title: "Edit purchase bill · Billing",
};

export default async function Page({ params }: PageProps<"/billing/purchase-bills/[id]/edit">) {
  const { id } = await params;
  return <DocumentEditorPage key={id} slug="purchase-bills" id={id} />;
}
