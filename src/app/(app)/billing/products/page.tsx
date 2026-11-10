import type { Metadata } from "next";

import { ProductsList } from "../_components/catalogue";

export const metadata: Metadata = {
  title: "Products · Billing",
};

export default function Page() {
  return <ProductsList />;
}
