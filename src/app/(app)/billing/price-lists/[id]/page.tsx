import type { Metadata } from "next";

import { PriceListDetailView } from "../../_components/catalogue";

export const metadata: Metadata = {
  title: "Price list · Billing",
};

export default async function Page({ params }: PageProps<"/billing/price-lists/[id]">) {
  const { id } = await params;
  return <PriceListDetailView key={id} id={id} />;
}
