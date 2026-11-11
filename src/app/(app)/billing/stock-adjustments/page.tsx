import type { Metadata } from "next";

import { AdjustmentsList } from "../_components/inventory";

export const metadata: Metadata = {
  title: "Stock adjustments · Billing",
};

export default function Page() {
  return <AdjustmentsList />;
}
