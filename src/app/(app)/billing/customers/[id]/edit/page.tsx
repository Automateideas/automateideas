import type { Metadata } from "next";

import { CustomerFormPage } from "../../../_components/customers";

export const metadata: Metadata = {
  title: "Edit customer · Billing",
};

export default async function Page({ params }: PageProps<"/billing/customers/[id]/edit">) {
  const { id } = await params;
  return <CustomerFormPage key={id} id={id} />;
}
