"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRightIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApiQuery } from "@/lib/api";
import { formatPaise } from "@/lib/business-billing/fields";
import type { Dashboard } from "@/lib/business-billing/reports/dashboard";
import { cn } from "@/lib/utils";

import { LoadError } from "../../_components/page-parts";
import { PeriodPicker, useSettings } from "./accounting";
import { fmtDate } from "./documents/documents-ui";
import { PartyFilter } from "./reports-ui";

type Data = Dashboard & { financialYear: { from: string; to: string; label: string } };

const compact = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", notation: "compact", maximumFractionDigits: 1 });
const short = (paise: number) => compact.format(paise / 100);
const monthLabel = (m: string, withYear = false) =>
  new Intl.DateTimeFormat("en-IN", { month: "short", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC" }).format(new Date(`${m}-01T00:00:00Z`));

/* ---------------- Filters + data ---------------- */

export function BillingDashboard() {
  const settings = useSettings();
  if (settings.status === "loading") return <Skeleton className="h-96 rounded-xl" aria-label="Loading dashboard" />;
  if (!settings.data) return <LoadError message={settings.error.message} onRetry={settings.reload} />;
  return <DashboardBody settings={settings.data} />;
}

function DashboardBody({ settings }: { settings: NonNullable<ReturnType<typeof useSettings>["data"]> }) {
  const [period, setPeriod] = useState({ from: settings.financialYear.from, to: settings.today });
  const [customerId, setCustomerId] = useState("");
  const query = new URLSearchParams({ ...period, ...(customerId ? { customerId } : {}) });
  const q = useApiQuery<Data>(`/api/business-billing/dashboard?${query}`);
  const reportQuery = (extra: Record<string, string> = {}) => new URLSearchParams({ ...period, ...(customerId ? { customerId } : {}), ...extra }).toString();

  return (
    <section aria-labelledby="dash-title" className="flex flex-col gap-4">
      <h2 id="dash-title" className="sr-only">
        Dashboard
      </h2>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <PeriodPicker from={period.from} to={period.to} settings={settings} onChange={(from, to) => setPeriod({ from, to })} />
        <div className="lg:w-64">
          <PartyFilter id="dash-customer" kind="customers" value={customerId} onValue={setCustomerId} />
        </div>
      </div>

      {q.status === "loading" && !q.data ? (
        <Skeleton className="h-96 rounded-xl" aria-label="Loading dashboard" />
      ) : !q.data ? (
        <LoadError message={q.error.message} onRetry={q.reload} />
      ) : (
        <div className="flex flex-col gap-4">
          <Kpis d={q.data} reportQuery={reportQuery} />
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Sales by month" description="Net of credit and debit notes" data={q.data.monthly.map((m) => ({ key: m.month, value: m.salesPaise }))} href={`/billing/reports/sales?${reportQuery({ report: "sales-by-period", groupBy: "month" })}`} />
            <ChartCard title="Payments collected by month" description="Money received from customers" data={q.data.monthly.map((m) => ({ key: m.month, value: m.collectedPaise }))} href={`/billing/reports/payments?${reportQuery({ report: "payment-collection" })}`} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {q.data.topCustomers.length || !customerId ? (
              <RankCard
                title="Top customers"
                empty="No sales in this period."
                rows={q.data.topCustomers.map((c) => ({ key: c.id, label: c.name, href: `/billing/customers/${c.id}`, value: c.salesPaise }))}
                href={`/billing/reports/sales?${reportQuery({ report: "sales-by-customer" })}`}
              />
            ) : null}
            <RankCard
              title="Top products and services"
              empty="No items sold in this period."
              rows={q.data.topItems.map((i, k) => ({ key: String(k), label: i.name, sub: `${i.quantity.toLocaleString("en-IN")}${i.unit ? ` ${i.unit}` : ""}`, value: i.salesPaise }))}
              href={`/billing/reports/sales?${reportQuery({ report: "sales-by-item" })}`}
              valueLabel="Taxable value"
            />
            {q.data.tax ? <TaxCard tax={q.data.tax} href={`/billing/reports/tax?${reportQuery({ report: "gst-summary" })}`} /> : null}
            <RecentCard d={q.data} />
          </div>
        </div>
      )}
    </section>
  );
}

/* ---------------- Headline numbers ---------------- */

function Kpis({ d, reportQuery }: { d: Data; reportQuery: (extra?: Record<string, string>) => string }) {
  const k = d.kpis;
  const tiles = [
    { label: "Sales", value: k.salesPaise, sub: `${k.invoices} invoice${k.invoices === 1 ? "" : "s"}`, href: `/billing/reports/sales?${reportQuery({ report: "sales-register" })}` },
    { label: "Collected", value: k.collectedPaise, sub: "Payments received", href: `/billing/reports/payments?${reportQuery({ report: "payment-collection" })}` },
    { label: "Customers owe", value: k.outstandingPaise, sub: k.overduePaise ? `${formatPaise(k.overduePaise)} overdue` : "Nothing overdue", danger: k.overduePaise > 0, href: "/billing/reports/payments?report=customer-outstanding" },
    ...(k.purchasesPaise === null ? [] : [{ label: "Purchases", value: k.purchasesPaise, sub: "Net of returns", href: `/billing/reports/purchases?${reportQuery({ report: "purchase-register" })}` }]),
    ...(k.payablePaise === null ? [] : [{ label: "You owe suppliers", value: k.payablePaise, sub: "Unpaid bills today", href: "/billing/reports/payments?report=supplier-outstanding" }]),
  ];
  return (
    <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {tiles.map((t) => (
        <li key={t.label}>
          <Link href={t.href} className="group block h-full rounded-xl border p-4 transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
            <p className="text-sm text-muted-foreground">{t.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{formatPaise(t.value)}</p>
            <p className={cn("text-xs", "danger" in t && t.danger ? "text-destructive" : "text-muted-foreground")}>{t.sub}</p>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/* ---------------- Monthly bars ---------------- */

type Point = { key: string; value: number };

function ChartCard({ title, description, data, href }: { title: string; description: string; data: Point[]; href: string }) {
  const total = data.reduce((a, p) => a + p.value, 0);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          {description} · {formatPaise(total)}
        </CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm" render={<Link href={href} />} nativeButton={false}>
            Details
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <MonthlyBars label={title} data={data} />
      </CardContent>
    </Card>
  );
}

/** One series of monthly bars with a recessive grid and a tooltip on hover or focus. */
function MonthlyBars({ label, data }: { label: string; data: Point[] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(0, ...data.map((d) => d.value));
  const ceiling = niceCeiling(max);
  const every = Math.ceil(data.length / 12);
  if (max === 0) return <p className="flex h-44 items-center justify-center text-sm text-muted-foreground">Nothing in this period.</p>;
  return (
    <figure className="flex flex-col gap-1">
      <div className="relative h-44" onMouseLeave={() => setActive(null)}>
        {/* Grid: 0, half, top. */}
        {[0, 0.5, 1].map((f) => (
          <div key={f} className="pointer-events-none absolute inset-x-0 flex items-center gap-2" style={{ bottom: `${f * 100}%` }} aria-hidden="true">
            <span className="w-12 shrink-0 -translate-y-px text-right text-[11px] text-muted-foreground tabular-nums">{short(ceiling * f)}</span>
            <span className={cn("h-px flex-1", f === 0 ? "bg-border" : "bg-border/50")} />
          </div>
        ))}
        <ol className="absolute inset-y-0 right-0 left-14 flex items-end gap-0.5">
          {data.map((d, i) => (
            <li key={d.key} className="relative flex h-full flex-1 items-end">
              <button
                type="button"
                className="group flex h-full w-full items-end justify-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`${monthLabel(d.key, true)}: ${formatPaise(d.value)}`}
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
              >
                <span
                  className={cn("w-full max-w-10 rounded-t-[4px] bg-brand-green transition-opacity", active !== null && active !== i && "opacity-50")}
                  style={{ height: `${d.value > 0 ? Math.max(1.5, (d.value / ceiling) * 100) : 0}%` }}
                />
              </button>
              {active === i ? (
                <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 -translate-x-1/2 rounded-md border bg-popover px-2 py-1 text-xs whitespace-nowrap text-popover-foreground shadow-sm">
                  <span className="block text-muted-foreground">{monthLabel(d.key, true)}</span>
                  <span className="font-medium tabular-nums">{formatPaise(d.value)}</span>
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      </div>
      <ol className="ml-14 flex gap-0.5" aria-hidden="true">
        {data.map((d, i) => (
          <li key={d.key} className="flex-1 truncate text-center text-[11px] text-muted-foreground">
            {i % every === 0 ? monthLabel(d.key) : ""}
          </li>
        ))}
      </ol>
      <figcaption className="sr-only">
        {label}: {data.map((d) => `${monthLabel(d.key, true)} ${formatPaise(d.value)}`).join(", ")}
      </figcaption>
    </figure>
  );
}

/** A round top for the axis: 1, 2 or 5 × a power of ten (in paise). */
function niceCeiling(max: number) {
  if (max <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 2, 5, 10]) if (m * pow >= max) return m * pow;
  return 10 * pow;
}

/* ---------------- Lists ---------------- */

function RankCard({ title, rows, href, empty, valueLabel = "Net sales" }: { title: string; rows: { key: string; label: string; sub?: string; href?: string; value: number }[]; href: string; empty: string; valueLabel?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{valueLabel}</CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm" render={<Link href={href} />} nativeButton={false}>
            All
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {rows.map((r) => (
              <li key={r.key} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">
                    {r.href ? (
                      <Link href={r.href} className="hover:underline">
                        {r.label}
                      </Link>
                    ) : (
                      r.label
                    )}
                    {r.sub ? <span className="ml-1.5 text-xs text-muted-foreground">{r.sub}</span> : null}
                  </span>
                  <span className="shrink-0 font-medium tabular-nums">{formatPaise(r.value)}</span>
                </div>
                <span className="h-1.5 rounded-full bg-muted" aria-hidden="true">
                  <span className="block h-full rounded-full bg-brand-green" style={{ width: `${(r.value / max) * 100}%` }} />
                </span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function TaxCard({ tax, href }: { tax: NonNullable<Data["tax"]>; href: string }) {
  const rows = [
    ["CGST", "cgst"],
    ["SGST", "sgst"],
    ["IGST", "igst"],
    ["Cess", "cess"],
  ] as const;
  return (
    <Card>
      <CardHeader>
        <CardTitle>GST</CardTitle>
        <CardDescription>Collected on sales vs. paid on purchases</CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm" render={<Link href={href} />} nativeButton={false}>
            Summary
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead />
              <TableHead className="text-right">Output</TableHead>
              <TableHead className="text-right">Input</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows
              .filter(([, k]) => tax.output[k] || tax.input[k])
              .map(([label, k]) => (
                <TableRow key={k}>
                  <TableCell>{label}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatPaise(tax.output[k])}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatPaise(tax.input[k])}</TableCell>
                </TableRow>
              ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell>{tax.netPaise >= 0 ? "Net payable" : "Credit carried forward"}</TableCell>
              <TableCell colSpan={2} className="text-right tabular-nums">
                {formatPaise(Math.abs(tax.netPaise))}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </CardContent>
    </Card>
  );
}

const KIND_LABELS: Record<string, string> = { invoice: "Invoice", payment: "Payment received", bill: "Purchase bill", supplier_payment: "Paid to supplier" };

function RecentCard({ d }: { d: Data }) {
  return (
    <Card className="lg:col-span-2 xl:col-span-1">
      <CardHeader>
        <CardTitle>Recent activity</CardTitle>
        <CardDescription>Latest invoices, bills and payments</CardDescription>
      </CardHeader>
      <CardContent>
        {d.recent.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing yet.</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {d.recent.map((r) => (
              <li key={`${r.kind}-${r.id}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0">
                  <Link href={r.href} className="font-medium hover:underline">
                    {r.number ?? KIND_LABELS[r.kind]}
                  </Link>
                  <span className="block truncate text-xs text-muted-foreground">
                    {KIND_LABELS[r.kind]} · {r.party} · {fmtDate(r.date)}
                  </span>
                </span>
                <span className={cn("shrink-0 tabular-nums", (r.kind === "bill" || r.kind === "supplier_payment") && "text-muted-foreground")}>{formatPaise(r.amountPaise)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
