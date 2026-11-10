import type { Metadata } from "next";

import { UnitsView } from "../_components/catalogue";

export const metadata: Metadata = {
  title: "Units · Billing",
};

export default function Page() {
  return <UnitsView />;
}
