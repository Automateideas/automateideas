import type { Metadata } from "next";

import { InventorySettingsView } from "../../_components/inventory";
import { SettingsNav } from "../../_components/tax-settings";

export const metadata: Metadata = {
  title: "Inventory settings · Billing",
};

export default function Page() {
  return (
    <div className="flex flex-col gap-6">
      <SettingsNav />
      <InventorySettingsView />
    </div>
  );
}
