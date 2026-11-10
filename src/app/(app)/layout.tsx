import { Suspense } from "react";

import { requireViewer } from "@/lib/viewer";

import { AppSidebar, AppSidebarSkeleton } from "./_components/app-sidebar";
import { SubscriptionBanner } from "./_components/subscription-banner";

// Shell for every signed-in page: sidebar on the left, page content on the right.
// The session read sits behind <Suspense> (Cache Components), so the shell renders at once.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden bg-neutral-100 md:flex-row dark:bg-neutral-800">
      <Suspense fallback={<AppSidebarSkeleton />}>
        <ViewerSidebar />
      </Suspense>
      <main className="flex flex-1 flex-col overflow-y-auto border-neutral-200 bg-white p-4 md:mt-2 md:rounded-tl-2xl md:border md:p-10 dark:border-neutral-700 dark:bg-neutral-900">
        <Suspense fallback={null}>
          <SubscriptionBanner />
        </Suspense>
        {children}
      </main>
    </div>
  );
}

async function ViewerSidebar() {
  const viewer = await requireViewer("/dashboard");
  return (
    <AppSidebar
      viewer={{
        name: viewer.user.name,
        canManageTeam: viewer.canManageTeam,
        canManageSubscription: viewer.canManageSubscription,
        canUseBilling: viewer.canUseBilling,
      }}
    />
  );
}
