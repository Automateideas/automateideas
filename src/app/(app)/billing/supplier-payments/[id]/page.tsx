import type { Metadata } from "next";

import { SupplierPaymentView } from "../../_components/supplier-payments";

export const metadata: Metadata = {
  title: "Supplier payment · Billing",
};

export default async function Page({ params }: PageProps<"/billing/supplier-payments/[id]">) {
  const { id } = await params;
  return <SupplierPaymentView key={id} id={id} />;
}
