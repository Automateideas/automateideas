import type { Metadata } from "next";

import { NumberingSettingsView } from "../../_components/tax-settings";

export const metadata: Metadata = {
  title: "Invoice numbering · Billing",
};

export default function Page() {
  return <NumberingSettingsView />;
}
