"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CircleCheckIcon, CircleXIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

// PayU sends the browser to /dashboard?billing=processing|failed after checkout.
export function BillingNotice() {
  const status = useSearchParams().get("billing");

  if (status === "processing") {
    return (
      <Alert>
        <CircleCheckIcon />
        <AlertTitle>Payment received</AlertTitle>
        <AlertDescription>
          We&apos;re confirming it with PayU. Your new seats show up on the{" "}
          <Link href="/subscription" className="underline underline-offset-4">Subscription</Link> page in a minute or two.
        </AlertDescription>
      </Alert>
    );
  }

  if (status === "failed") {
    return (
      <Alert variant="destructive">
        <CircleXIcon />
        <AlertTitle>Payment didn&apos;t go through</AlertTitle>
        <AlertDescription>
          You haven&apos;t been charged and your seats are unchanged.{" "}
          <Link href="/subscription/plans" className="underline underline-offset-4">Try again from Subscription</Link>.
        </AlertDescription>
      </Alert>
    );
  }

  return null;
}
