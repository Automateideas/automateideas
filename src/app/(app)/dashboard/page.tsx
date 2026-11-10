import type { Metadata } from "next";
import { Suspense } from "react";

import { BillingNotice } from "./billing-notice";
import { ContactReminder } from "./contact-reminder";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">Welcome to Automate Ideas.</p>
      </header>
      <Suspense fallback={null}>
        <BillingNotice />
      </Suspense>
      <Suspense fallback={null}>
        <ContactReminder />
      </Suspense>
    </div>
  );
}
