import type { Metadata } from "next";

import { PayablesView } from "../_components/supplier-payments";

export const metadata: Metadata = {
  title: "Payables · Billing",
};

export default function Page() {
  return <PayablesView />;
}
