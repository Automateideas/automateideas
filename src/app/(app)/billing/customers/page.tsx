import type { Metadata } from "next";

import { CustomersList } from "../_components/customers";

export const metadata: Metadata = {
  title: "Customers · Billing",
};

export default function Page() {
  return <CustomersList />;
}
