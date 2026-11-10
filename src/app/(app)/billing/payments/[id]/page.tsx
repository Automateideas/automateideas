import type { Metadata } from "next";

import { PaymentView } from "../../_components/payments";

export const metadata: Metadata = {
  title: "Payment receipt · Billing",
};

export default async function Page({ params }: PageProps<"/billing/payments/[id]">) {
  const { id } = await params;
  return <PaymentView key={id} id={id} />;
}
