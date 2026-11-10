import Link from "next/link";
import { AlertTriangleIcon } from "lucide-react";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { getEntitlements } from "@/lib/subscription-billing/entitlements";
import { getViewer } from "@/lib/viewer";

// Shown on every signed-in page while the subscription is in its grace period
// or read-only. Nothing when access is full (always, during early access).
export async function SubscriptionBanner() {
  const viewer = await getViewer();
  if (!viewer?.organization) return null;
  const { access } = await getEntitlements(viewer.organization.id);
  if (access.state === "full") return null;

  const readOnly = access.state === "read_only";
  return (
    <Alert variant={readOnly ? "destructive" : "default"} className="mb-6">
      <AlertTriangleIcon />
      <AlertTitle>{readOnly ? "Your workspace is read-only" : "Your subscription needs renewing"}</AlertTitle>
      <AlertDescription>
        {access.reason}
        {viewer.canManageSubscription ? "" : " Ask an owner or admin to renew."}
      </AlertDescription>
      {viewer.canManageSubscription ? (
        <AlertAction>
          <Button size="sm" render={<Link href="/subscription/plans" />} nativeButton={false}>
            Renew
          </Button>
        </AlertAction>
      ) : null}
    </Alert>
  );
}
