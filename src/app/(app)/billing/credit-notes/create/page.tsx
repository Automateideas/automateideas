import type { Metadata } from "next";

import { DocumentEditorPage } from "../../_components/documents/document-editor";

export const metadata: Metadata = {
  title: "New credit note · Billing",
};

export default function Page() {
  return <DocumentEditorPage slug="credit-notes" />;
}
