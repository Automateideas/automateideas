import type { Metadata } from "next";

import { DocumentEditorPage } from "../../../_components/documents/document-editor";

export const metadata: Metadata = {
  title: "Edit sales order · Billing",
};

export default async function Page({ params }: PageProps<"/billing/sales-orders/[id]/edit">) {
  const { id } = await params;
  return <DocumentEditorPage key={id} slug="sales-orders" id={id} />;
}
