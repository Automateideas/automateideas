import type { Metadata } from "next";

import { RecordSupplierPaymentForm } from "../../_components/supplier-payments";

export const metadata: Metadata = {
  title: "Pay a supplier · Billing",
};

// ?supplierId= and ?billId= prefill the form (from a supplier or bill page).
export default async function Page({ searchParams }: PageProps<"/billing/supplier-payments/create">) {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  return <RecordSupplierPaymentForm key={`${one(sp.supplierId)}-${one(sp.billId)}`} supplierId={one(sp.supplierId)} billId={one(sp.billId)} />;
}
