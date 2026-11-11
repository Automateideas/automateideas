import type { Metadata } from "next";

import { CommunicationSettingsView } from "../../_components/communication-ui";
import { SettingsNav } from "../../_components/tax-settings";

export const metadata: Metadata = {
  title: "Email and reminders · Billing",
};

export default function Page() {
  return (
    <div className="flex flex-col gap-6">
      <SettingsNav />
      <CommunicationSettingsView />
    </div>
  );
}
