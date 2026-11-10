import type { Metadata } from "next";

import { RefundsList } from "../_components/payments";

export const metadata: Metadata = {
  title: "Refunds · Billing",
};

export default function Page() {
  return <RefundsList />;
}
