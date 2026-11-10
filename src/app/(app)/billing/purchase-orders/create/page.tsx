import type { Metadata } from "next";

import { DocumentEditorPage } from "../../_components/documents/document-editor";

export const metadata: Metadata = {
  title: "New purchase order · Billing",
};

export default function Page() {
  return <DocumentEditorPage slug="purchase-orders" />;
}
