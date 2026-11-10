import type { Metadata } from "next";

import { RecordPaymentForm } from "../../_components/payments";

export const metadata: Metadata = {
  title: "Record payment · Billing",
};

// ?customerId= and ?invoiceId= prefill the form (from a customer or invoice page).
export default async function Page({ searchParams }: PageProps<"/billing/payments/create">) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  return <RecordPaymentForm key={`${one(sp.customerId)}-${one(sp.invoiceId)}`} customerId={one(sp.customerId)} invoiceId={one(sp.invoiceId)} />;
}
