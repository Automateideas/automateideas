import type { Metadata } from "next";

import { DocumentEditorPage } from "../../../_components/documents/document-editor";

export const metadata: Metadata = {
  title: "Edit invoice · Billing",
};

export default async function Page({ params }: PageProps<"/billing/invoices/[id]/edit">) {
  const { id } = await params;
  return <DocumentEditorPage key={id} slug="invoices" id={id} />;
}
