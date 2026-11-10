import type { Metadata } from "next";
import { Suspense } from "react";

import { BillingNotice } from "./billing-notice";
import { ContactReminder } from "./contact-reminder";
import { QuickActions, QuickActionsSkeleton, Welcome, WelcomeSkeleton } from "./welcome";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-8">
      <Suspense fallback={<WelcomeSkeleton />}>
        <Welcome />
      </Suspense>
      <Suspense fallback={null}>
        <BillingNotice />
      </Suspense>
      <Suspense fallback={null}>
        <ContactReminder />
      </Suspense>
      <Suspense fallback={<QuickActionsSkeleton />}>
        <QuickActions />
      </Suspense>
    </div>
  );
}
