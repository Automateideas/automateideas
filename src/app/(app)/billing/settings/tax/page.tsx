import type { Metadata } from "next";

import { TaxSettingsView } from "../../_components/tax-settings";

export const metadata: Metadata = {
  title: "Tax settings · Billing",
};

export default function Page() {
  return <TaxSettingsView />;
}
