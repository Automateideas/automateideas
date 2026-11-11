import type { Metadata } from "next";

import { AdjustmentView } from "../../_components/inventory";

export const metadata: Metadata = {
  title: "Stock adjustment · Billing",
};

export default async function Page({ params }: PageProps<"/billing/stock-adjustments/[id]">) {
  const { id } = await params;
  return <AdjustmentView key={id} id={id} />;
}
