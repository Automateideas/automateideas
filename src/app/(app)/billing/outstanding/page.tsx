import type { Metadata } from "next";

import { OutstandingView } from "../_components/payments";

export const metadata: Metadata = {
  title: "Outstanding · Billing",
};

export default function Page() {
  return <OutstandingView />;
}
