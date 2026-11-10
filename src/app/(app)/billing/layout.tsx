import { Suspense } from "react";
import { redirect } from "next/navigation";

import { Skeleton } from "@/components/ui/skeleton";
import { requireViewer } from "@/lib/viewer";

import { PageHeader } from "../_components/page-parts";
import { BillingNav } from "./_components/billing-nav";

// Shell for /billing/*: the Business Billing module, where a tenant company
// bills its own customers. Separate from /subscription (what the workspace
// pays Automate Ideas): its own pages, APIs (/api/business-billing), tables
// and permissions (billing.* in lib/roles.ts).
export default function BillingLayout({ children }: LayoutProps<"/billing">) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Billing" description="Invoices, customers and payments for your business." />
      {/* The tabs read the URL; on pages with an unknown id (/billing/customers/[id]) that
          only resolves at request time, so they stream in behind a same-height placeholder. */}
      <Suspense fallback={<div className="h-10 border-b" aria-hidden="true" />}>
        <BillingNav />
      </Suspense>
      <Suspense fallback={<Skeleton className="h-72 rounded-xl" aria-label="Loading" />}>
        <BillingGate>{children}</BillingGate>
      </Suspense>
    </div>
  );
}

// Needs billing.view; everyone else goes to the dashboard.
async function BillingGate({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer("/billing");
  if (!viewer.canUseBilling) redirect("/dashboard");
  return children;
}
