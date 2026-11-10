import type { Metadata } from "next";

import { CustomerFormPage } from "../../_components/customers";

export const metadata: Metadata = {
  title: "Add customer · Billing",
};

export default function Page() {
  return <CustomerFormPage />;
}
