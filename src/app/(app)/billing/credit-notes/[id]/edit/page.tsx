import type { Metadata } from "next";

import { DocumentEditorPage } from "../../../_components/documents/document-editor";

export const metadata: Metadata = {
  title: "Edit credit note · Billing",
};

export default async function Page({ params }: PageProps<"/billing/credit-notes/[id]/edit">) {
  const { id } = await params;
  return <DocumentEditorPage key={id} slug="credit-notes" id={id} />;
}
