import type { Metadata } from "next";

import { AccountingSettingsView } from "../../_components/accounting";
import { SettingsNav } from "../../_components/tax-settings";

export const metadata: Metadata = {
  title: "Accounting settings · Billing",
};

export default function Page() {
  return (
    <div className="flex flex-col gap-6">
      <SettingsNav />
      <AccountingSettingsView />
    </div>
  );
}
