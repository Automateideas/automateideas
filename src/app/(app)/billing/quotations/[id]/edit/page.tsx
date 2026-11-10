import type { Metadata } from "next";

import { DocumentEditorPage } from "../../../_components/documents/document-editor";

export const metadata: Metadata = {
  title: "Edit quotation · Billing",
};

export default async function Page({ params }: PageProps<"/billing/quotations/[id]/edit">) {
  const { id } = await params;
  return <DocumentEditorPage key={id} slug="quotations" id={id} />;
}
