import type { Metadata } from "next";

import { CustomerDetailView } from "../../_components/customers";

export const metadata: Metadata = {
  title: "Customer · Billing",
};

export default async function Page({ params }: PageProps<"/billing/customers/[id]">) {
  const { id } = await params;
  return <CustomerDetailView key={id} id={id} />;
}
