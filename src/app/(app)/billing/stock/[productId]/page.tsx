import type { Metadata } from "next";

import { ProductStockView } from "../../_components/inventory";

export const metadata: Metadata = {
  title: "Product stock · Billing",
};

export default async function Page({ params }: PageProps<"/billing/stock/[productId]">) {
  const { productId } = await params;
  return <ProductStockView key={productId} id={productId} />;
}
