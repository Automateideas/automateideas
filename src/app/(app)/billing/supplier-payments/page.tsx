import type { Metadata } from "next";

import { SupplierPaymentsList } from "../_components/supplier-payments";

export const metadata: Metadata = {
  title: "Supplier payments · Billing",
};

export default function Page() {
  return <SupplierPaymentsList />;
}
