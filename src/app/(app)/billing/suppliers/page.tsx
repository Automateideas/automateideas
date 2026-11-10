import type { Metadata } from "next";

import { SuppliersList } from "../_components/suppliers";

export const metadata: Metadata = {
  title: "Suppliers · Billing",
};

export default function Page() {
  return <SuppliersList />;
}
