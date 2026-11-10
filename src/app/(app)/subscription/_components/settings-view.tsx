"use client";

import { useState, useTransition } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldError } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ApiError, api, useApiQuery } from "@/lib/api";

import { LoadError } from "../../_components/page-parts";
import { dateFormat, inr } from "./subscription-view";

type SubscriptionSettings = {
  organizationName: string | null;
  customerSince: string | null;
  billingContact: { name: string; email: string } | null;
  provider: string;
  paymentsEnabled: boolean;
  paymentEnvironment: "test" | "live" | null;
  subscriptionId: string | null;
  planName: string;
  billingCycle: string;
  pricePerSeatInr: number;
  currency: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  canCancel: boolean;
  canResume: boolean;
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-6">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium sm:text-right">{children}</dd>
    </div>
  );
}

/** /subscription/settings: read-only details of how the subscription is set up. */
export function SubscriptionSettingsView() {
  const query = useApiQuery<SubscriptionSettings>("/api/subscription/settings");

  if (query.status === "loading") {
    return <Skeleton className="h-80 max-w-2xl rounded-xl" aria-label="Loading settings" aria-busy="true" />;
  }
  if (!query.data) return <LoadError message={query.error.message} onRetry={query.reload} />;
  const s = query.data;

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Billing details</CardTitle>
          <CardDescription>How your subscription is set up. Contact support to change these.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="flex flex-col gap-4 text-sm">
            <Row label="Organization">{s.organizationName ?? "—"}</Row>
            <Row label="Billing contact">
              {s.billingContact ? (
                <span className="flex flex-col sm:items-end">
                  <span>{s.billingContact.name}</span>
                  <span className="font-normal text-muted-foreground">{s.billingContact.email}</span>
                </span>
              ) : (
                "—"
              )}
            </Row>
            <Row label="Customer since">{s.customerSince ? dateFormat.format(new Date(s.customerSince)) : "—"}</Row>
            <Row label="Plan">{s.planName}</Row>
            <Row label="Billing cycle">
              {s.billingCycle === "yearly" ? "Yearly" : "Monthly"}, from {inr.format(s.pricePerSeatInr)} per seat a month
            </Row>
            {s.currentPeriodEnd ? (
              <Row label={s.cancelAtPeriodEnd ? "Ends on" : "Renews on"}>{dateFormat.format(new Date(s.currentPeriodEnd))}</Row>
            ) : null}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment provider</CardTitle>
          <CardDescription>Seat payments go through {s.provider}&apos;s secure checkout.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="flex flex-col gap-4 text-sm">
            <Row label="Provider">{s.provider}</Row>
            <Row label="Payments">
              {s.paymentsEnabled ? (
                <Badge variant={s.paymentEnvironment === "test" ? "secondary" : "default"}>
                  {s.paymentEnvironment === "test" ? "On (test mode)" : "On"}
                </Badge>
              ) : (
                <Badge variant="secondary">Off, early access</Badge>
              )}
            </Row>
            <Row label="Subscription ID">
              <span className="font-mono text-xs">{s.subscriptionId ?? "None yet"}</span>
            </Row>
          </dl>
        </CardContent>
      </Card>

      {s.canCancel || s.canResume ? (
        <CancelCard
          cancelAtPeriodEnd={s.cancelAtPeriodEnd}
          periodEnd={s.currentPeriodEnd}
          onChanged={query.reload}
        />
      ) : null}
    </div>
  );
}

/** Cancel at period end (with a confirm step), or undo a cancellation. */
function CancelCard({
  cancelAtPeriodEnd,
  periodEnd,
  onChanged,
}: {
  cancelAtPeriodEnd: boolean;
  periodEnd: string | null;
  onChanged: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const until = periodEnd ? dateFormat.format(new Date(periodEnd)) : "the end of this period";

  function run(path: string) {
    setError(null);
    startTransition(async () => {
      try {
        await api(path, { method: "POST" });
        setConfirming(false);
        onChanged();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{cancelAtPeriodEnd ? "Subscription ending" : "Cancel subscription"}</CardTitle>
        <CardDescription>
          {cancelAtPeriodEnd
            ? `Your subscription ends on ${until}. After that your workspace becomes read-only; nothing is deleted.`
            : `You keep full access until ${until}. After that your workspace becomes read-only; nothing is deleted, and you can subscribe again any time.`}
        </CardDescription>
      </CardHeader>
      <CardFooter className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        {cancelAtPeriodEnd ? (
          <Button onClick={() => run("/api/subscription/resume")} disabled={pending}>
            {pending ? <Spinner data-icon="inline-start" /> : null}
            Keep my subscription
          </Button>
        ) : confirming ? (
          <>
            <Button variant="destructive" onClick={() => run("/api/subscription/cancel")} disabled={pending}>
              {pending ? <Spinner data-icon="inline-start" /> : null}
              Yes, cancel at period end
            </Button>
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={pending}>
              Keep subscription
            </Button>
          </>
        ) : (
          <Button variant="outline" onClick={() => setConfirming(true)}>
            Cancel subscription
          </Button>
        )}
        {error ? <FieldError>{error}</FieldError> : null}
      </CardFooter>
    </Card>
  );
}
