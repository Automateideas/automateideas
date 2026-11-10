import type { Metadata } from "next";

import { PaymentsList } from "../_components/payments";

export const metadata: Metadata = {
  title: "Payments · Billing",
};

export default function Page() {
  return <PaymentsList />;
}
