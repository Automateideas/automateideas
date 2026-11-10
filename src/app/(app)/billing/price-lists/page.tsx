import type { Metadata } from "next";

import { PriceListsView } from "../_components/catalogue";

export const metadata: Metadata = {
  title: "Price lists · Billing",
};

export default function Page() {
  return <PriceListsView />;
}
