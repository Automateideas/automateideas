import type { Metadata } from "next";

import { DocumentsList } from "../_components/documents/documents-ui";

export const metadata: Metadata = {
  title: "Invoices · Billing",
};

export default function Page() {
  return <DocumentsList slug="invoices" />;
}
