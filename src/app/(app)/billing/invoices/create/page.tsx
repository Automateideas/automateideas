import type { Metadata } from "next";

import { DocumentEditorPage } from "../../_components/documents/document-editor";

export const metadata: Metadata = {
  title: "New invoice · Billing",
};

export default function Page() {
  return <DocumentEditorPage slug="invoices" />;
}
