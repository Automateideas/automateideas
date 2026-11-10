import type { Metadata } from "next";

import { ServicesList } from "../_components/catalogue";

export const metadata: Metadata = {
  title: "Services · Billing",
};

export default function Page() {
  return <ServicesList />;
}
