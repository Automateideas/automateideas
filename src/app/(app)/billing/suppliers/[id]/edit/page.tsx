import type { Metadata } from "next";

import { SupplierFormPage } from "../../../_components/suppliers";

export const metadata: Metadata = {
  title: "Edit supplier · Billing",
};

export default async function Page({ params }: PageProps<"/billing/suppliers/[id]/edit">) {
  const { id } = await params;
  return <SupplierFormPage key={id} id={id} />;
}
