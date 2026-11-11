import type { Metadata } from "next";

import { LandingPage } from "./_landing/landing";

export const metadata: Metadata = {
  // The root layout's template adds " · Automate Ideas" to page titles; the home page sets its own.
  title: { absolute: "Automate Ideas: GST billing and team app for Indian businesses" },
  description:
    "Make GST invoices and quotations, see what every customer owes and give each employee their own login. Plus automation services for Google Workspace and WhatsApp.",
  openGraph: {
    title: "Automate Ideas: GST billing and team app for Indian businesses",
    description: "GST invoices, quotations, payments and team logins. Free during early access, then ₹100 per seat a month.",
    type: "website",
  },
};

export default function Home() {
  return <LandingPage />;
}
