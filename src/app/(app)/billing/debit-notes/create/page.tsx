import type { Metadata } from "next";

import { DocumentEditorPage } from "../../_components/documents/document-editor";

export const metadata: Metadata = {
  title: "New debit note · Billing",
};

export default function Page() {
  return <DocumentEditorPage slug="debit-notes" />;
}
