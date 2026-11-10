import type { Metadata } from "next";

import { BrandingSettingsView } from "../../_components/branding-settings";

export const metadata: Metadata = {
  title: "Branding · Billing",
};

export default function Page() {
  return <BrandingSettingsView />;
}
