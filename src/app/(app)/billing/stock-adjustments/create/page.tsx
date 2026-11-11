import type { Metadata } from "next";

import { AdjustmentForm } from "../../_components/inventory";

export const metadata: Metadata = {
  title: "Adjust stock · Billing",
};

// ?kind=transfer opens a transfer; ?productId= prefills the first line (from a product's stock page).
export default async function Page({ searchParams }: PageProps<"/billing/stock-adjustments/create">) {
  const sp = await searchParams;
  const kind = sp.kind === "transfer" ? "transfer" : "adjustment";
  const productId = typeof sp.productId === "string" ? sp.productId : undefined;
  return <AdjustmentForm key={`${kind}-${productId}`} kind={kind} productId={productId} />;
}
