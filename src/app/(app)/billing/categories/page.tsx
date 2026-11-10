import type { Metadata } from "next";

import { CategoriesView } from "../_components/catalogue";

export const metadata: Metadata = {
  title: "Categories · Billing",
};

export default function Page() {
  return <CategoriesView />;
}
