import type { Metadata } from "next";

import { SupplierDetailView } from "../../_components/suppliers";

export const metadata: Metadata = {
  title: "Supplier · Billing",
};

export default async function Page({ params }: PageProps<"/billing/suppliers/[id]">) {
  const { id } = await params;
  return <SupplierDetailView key={id} id={id} />;
}
