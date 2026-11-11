import type { Metadata } from "next";

import { WarehousesView } from "../_components/inventory";

export const metadata: Metadata = {
  title: "Warehouses · Billing",
};

export default function Page() {
  return <WarehousesView />;
}
