"use client";

import Link from "next/link";
import { ArrowRightIcon, Building2Icon, CircleCheckIcon } from "lucide-react";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiQuery } from "@/lib/api";
import { BRAND_TONES } from "@/lib/brand-tones";
import { cn } from "@/lib/utils";

import { LoadError } from "../../_components/page-parts";
import { BillingDashboard } from "./dashboard-view";
import { BILLING_SECTIONS, BUILT_SECTIONS } from "./sections";

type Overview = {
  company: { configured: boolean; name: string; gstin: string | null; currency: string };
  permissions: string[];
};

/** /billing: company setup status, the dashboard (with billing.reports.view) and a card for each section. */
export function BillingOverview() {
  const overview = useApiQuery<Overview>("/api/business-billing/overview");

  return (
    <div className="flex flex-col gap-6">
      {overview.status === "loading" ? (
        <Skeleton className="h-24 rounded-xl" aria-label="Loading company details" />
      ) : !overview.data ? (
        <LoadError message={overview.error.message} onRetry={overview.reload} />
      ) : overview.data.company.configured ? (
        <Alert>
          <CircleCheckIcon />
          <AlertTitle>{overview.data.company.name}</AlertTitle>
          <AlertDescription>
            {overview.data.company.gstin ? `GSTIN ${overview.data.company.gstin} · ` : ""}
            Billing in {overview.data.company.currency}
          </AlertDescription>
          <AlertAction>
            <Button variant="outline" size="sm" render={<Link href="/billing/settings" />} nativeButton={false}>
              Edit
            </Button>
          </AlertAction>
        </Alert>
      ) : (
        <Alert>
          <Building2Icon />
          <AlertTitle>Set up your company details</AlertTitle>
          <AlertDescription>
            Your business name, GSTIN and address appear on every invoice and quotation.
          </AlertDescription>
          <AlertAction>
            <Button size="sm" render={<Link href="/billing/settings" />} nativeButton={false}>
              Set up
            </Button>
          </AlertAction>
        </Alert>
      )}

      {overview.data?.company.configured && overview.data.permissions.includes("billing.reports.view") ? <BillingDashboard /> : null}

      <h2 className="sr-only">Sections</h2>
      <ul className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {BILLING_SECTIONS.map(({ slug, label, Icon, summary, tone }) => (
          <li key={slug}>
            <Link
              href={`/billing/${slug}`}
              className="group block h-full rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <Card className="h-full transition-colors group-hover:bg-muted/50">
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn("flex size-9 items-center justify-center rounded-lg", BRAND_TONES[tone])}>
                      <Icon className="size-4" aria-hidden="true" />
                    </span>
                    {(BUILT_SECTIONS as readonly string[]).includes(slug) ? null : (
                      <Badge variant="secondary">Coming soon</Badge>
                    )}
                  </div>
                  <CardTitle className="flex items-center gap-1.5 pt-2">
                    {label}
                    <ArrowRightIcon
                      className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </CardTitle>
                  <CardDescription>{summary}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
