import { Suspense } from "react";
import { redirect } from "next/navigation";

import { Skeleton } from "@/components/ui/skeleton";
import { requireViewer } from "@/lib/viewer";

import { PageHeader } from "../_components/page-parts";
import { SubscriptionNav } from "./_components/subscription-nav";

// Shell for /subscription/*: title, section tabs, and the permission check.
// The SaaS subscription moved here from /billing (next.config.ts redirects).
export default function SubscriptionLayout({ children }: LayoutProps<"/subscription">) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Plan & seats" description="What your workspace pays Automate Ideas: plan, seats and payments." />
      <SubscriptionNav />
      <Suspense fallback={<Skeleton className="h-72 max-w-2xl rounded-xl" aria-label="Loading" />}>
        <SubscriptionGate>{children}</SubscriptionGate>
      </Suspense>
    </div>
  );
}

// Only owners and admins manage the subscription; everyone else goes to the dashboard.
async function SubscriptionGate({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer("/subscription");
  if (!viewer.canManageSubscription) redirect("/dashboard");
  return children;
}
