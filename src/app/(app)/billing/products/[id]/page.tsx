import type { Metadata } from "next";

import { ProductFormPage } from "../../_components/catalogue";

export const metadata: Metadata = {
  title: "Product · Billing",
};

export default async function Page({ params }: PageProps<"/billing/products/[id]">) {
  const { id } = await params;
  return <ProductFormPage key={id} id={id} />;
}
