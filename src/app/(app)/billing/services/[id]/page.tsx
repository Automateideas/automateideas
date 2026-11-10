import type { Metadata } from "next";

import { ServiceFormPage } from "../../_components/catalogue";

export const metadata: Metadata = {
  title: "Service · Billing",
};

export default async function Page({ params }: PageProps<"/billing/services/[id]">) {
  const { id } = await params;
  return <ServiceFormPage key={id} id={id} />;
}
