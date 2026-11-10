import type { Metadata } from "next";

import { SectionPlaceholder } from "../_components/section-placeholder";

export const metadata: Metadata = {
  title: "Purchases · Billing",
};

export default function Page() {
  return <SectionPlaceholder slug="purchases" />;
}
