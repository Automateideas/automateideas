import type { Metadata } from "next";

import { DocumentsList } from "../_components/documents/documents-ui";

export const metadata: Metadata = {
  title: "Sales orders · Billing",
};

export default function Page() {
  return <DocumentsList slug="sales-orders" />;
}
