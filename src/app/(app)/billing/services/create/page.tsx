import type { Metadata } from "next";

import { ServiceFormPage } from "../../_components/catalogue";

export const metadata: Metadata = {
  title: "Add service · Billing",
};

export default function Page() {
  return <ServiceFormPage />;
}
