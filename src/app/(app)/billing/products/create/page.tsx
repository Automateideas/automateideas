import type { Metadata } from "next";

import { ProductFormPage } from "../../_components/catalogue";

export const metadata: Metadata = {
  title: "Add product · Billing",
};

export default function Page() {
  return <ProductFormPage />;
}
