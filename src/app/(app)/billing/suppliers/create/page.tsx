import type { Metadata } from "next";

import { SupplierFormPage } from "../../_components/suppliers";

export const metadata: Metadata = {
  title: "Add supplier · Billing",
};

export default function Page() {
  return <SupplierFormPage />;
}
