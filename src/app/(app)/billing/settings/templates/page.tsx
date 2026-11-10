import type { Metadata } from "next";

import { TemplateSettingsView } from "../../_components/template-settings";

export const metadata: Metadata = {
  title: "Templates · Billing",
};

export default function Page() {
  return <TemplateSettingsView />;
}
