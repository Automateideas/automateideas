import { Suspense } from "react";
import type { Metadata } from "next";
import { DownloadIcon, FileTextIcon } from "lucide-react";

import { sharedSummary } from "@/lib/business-billing/communication/public";

export const metadata: Metadata = {
  title: "Document",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const inr = (paise: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(paise / 100);
const day = (d: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

// A document shared by link (email or WhatsApp). Public: the secret token in the
// address is the permission, and it opens only this one document.
export default function Page({ params }: PageProps<"/share/[token]">) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/40 p-4">
      <Suspense fallback={<p className="text-sm text-muted-foreground">Loading…</p>}>
        <Shared params={params} />
      </Suspense>
    </main>
  );
}

async function Shared({ params }: { params: PageProps<"/share/[token]">["params"] }) {
  const { token } = await params;
  const d = await sharedSummary(token);
  if (!d) {
    return (
      <section className="w-full max-w-md rounded-xl border bg-background p-6 text-center">
        <h1 className="text-lg font-semibold">This link doesn&apos;t work any more</h1>
        <p className="mt-2 text-sm text-muted-foreground">It may have expired or been turned off. Ask the sender for a new one.</p>
      </section>
    );
  }
  const pdf = `/api/share/${token}`;
  return (
    <section className="w-full max-w-md rounded-xl border bg-background p-6" aria-labelledby="doc-title">
      <p className="text-sm text-muted-foreground">{d.company}</p>
      <h1 id="doc-title" className="mt-1 flex items-center gap-2 text-xl font-semibold">
        <FileTextIcon className="size-5 text-muted-foreground" aria-hidden="true" />
        {d.label} {d.number}
      </h1>
      {d.void ? (
        <p role="status" className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          This {d.label.toLowerCase()} was cancelled by {d.company}. It no longer applies.
        </p>
      ) : null}
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {d.partyName ? (
          <>
            <dt className="text-muted-foreground">For</dt>
            <dd className="text-right">{d.partyName}</dd>
          </>
        ) : null}
        <dt className="text-muted-foreground">Date</dt>
        <dd className="text-right">{day(d.date)}</dd>
        {d.dueDate ? (
          <>
            <dt className="text-muted-foreground">Due</dt>
            <dd className="text-right">{day(d.dueDate)}</dd>
          </>
        ) : null}
        <dt className="text-muted-foreground">{d.label === "Receipt" ? "Amount received" : "Total"}</dt>
        <dd className="text-right font-medium tabular-nums">{inr(d.totalPaise)}</dd>
        {d.balancePaise !== null && !d.void ? (
          <>
            <dt className="text-muted-foreground">Still to pay</dt>
            <dd className="text-right font-medium tabular-nums">{d.balancePaise > 0 ? inr(d.balancePaise) : "Paid in full"}</dd>
          </>
        ) : null}
      </dl>
      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <a href={pdf} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
          <FileTextIcon className="size-4" aria-hidden="true" />
          View PDF
        </a>
        <a href={`${pdf}?download=1`} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-medium hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
          <DownloadIcon className="size-4" aria-hidden="true" />
          Download
        </a>
      </div>
      <p className="mt-6 text-xs text-muted-foreground">Shared securely by {d.company} using Automate Ideas. Questions? Reply to their message.</p>
    </section>
  );
}
