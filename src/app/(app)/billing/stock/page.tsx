import type { Metadata } from "next";

import { StockList } from "../_components/inventory";

export const metadata: Metadata = {
  title: "Stock · Billing",
};

export default function Page() {
  return <StockList />;
}
