import type { Metadata } from "next";

import { BillingSettingsView } from "../_components/settings-form";
import { SettingsNav } from "../_components/tax-settings";

export const metadata: Metadata = {
  title: "Billing settings",
};

export default function Page() {
  return (
    <div className="flex flex-col gap-6">
      <div className="max-w-3xl">
        <SettingsNav />
      </div>
      <BillingSettingsView />
    </div>
  );
}
