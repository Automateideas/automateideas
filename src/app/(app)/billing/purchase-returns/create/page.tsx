import type { Metadata } from "next";

import { DocumentEditorPage } from "../../_components/documents/document-editor";

export const metadata: Metadata = {
  title: "New purchase return · Billing",
};

export default function Page() {
  return <DocumentEditorPage slug="purchase-returns" />;
}
