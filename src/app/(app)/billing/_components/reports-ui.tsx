"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BarChart3Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApiQuery } from "@/lib/api";
import {
  GROUP_BY,
  GROUP_BY_LABELS,
  INVOICE_STATUS_FILTERS,
  PAYMENT_STATUS_FILTERS,
  REPORTS,
  REPORT_GROUPS,
  type ReportGroup,
} from "@/lib/business-billing/reports/catalog";
import type { Cell, Column, ReportTable } from "@/lib/business-billing/reports/table";
import { formatPaise } from "@/lib/business-billing/fields";
import { cn } from "@/lib/utils";

import { LoadError } from "../../_components/page-parts";
import { SectionNav } from "../../_components/section-nav";
import { AsOfPicker, PeriodPicker, useSettings } from "./accounting";
import { fmtDate } from "./documents/documents-ui";
import { ExportButtons } from "./report-export";
import { EmptyList, ListSkeleton, SelectField } from "./records-ui";

const API = "/api/business-billing/reports";
const GROUPS = Object.keys(REPORT_GROUPS) as ReportGroup[];

export function ReportsNav() {
  return (
    <SectionNav
      label="Reports"
      links={[
        { href: "/billing/reports", label: "All reports" },
        ...GROUPS.map((g) => ({ href: `/billing/reports/${g}`, label: REPORT_GROUPS[g].label })),
      ]}
    />
  );
}

/* ---------------- Catalogue ---------------- */

export function ReportsHome() {
  return (
    <div className="flex flex-col gap-6">
      <ReportsNav />
      {GROUPS.map((g) => (
        <section key={g} aria-labelledby={`group-${g}`} className="flex flex-col gap-3">
          <div>
            <h2 id={`group-${g}`} className="text-base font-semibold">
              {REPORT_GROUPS[g].label}
            </h2>
            <p className="text-sm text-muted-foreground">{REPORT_GROUPS[g].description}</p>
          </div>
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {REPORTS.filter((r) => r.group === g).map((r) => (
              <li key={r.id}>
                <Link href={`/billing/reports/${g}?report=${r.id}`} className="group block h-full rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
                  <Card size="sm" className="h-full transition-colors group-hover:bg-muted/50">
                    <CardHeader>
                      <CardTitle>{r.label}</CardTitle>
                      <CardDescription>{r.description}</CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <section aria-labelledby="group-accounting" className="flex flex-col gap-3">
        <div>
          <h2 id="group-accounting" className="text-base font-semibold">
            Accounting statements
          </h2>
          <p className="text-sm text-muted-foreground">From your books, each with CSV and Excel downloads.</p>
        </div>
        <ul className="flex flex-wrap gap-2">
          {[
            ["/billing/profit-loss", "Profit and loss"],
            ["/billing/balance-sheet", "Balance sheet"],
            ["/billing/trial-balance", "Trial balance"],
            ["/billing/ledger", "Customer, supplier and account ledgers"],
          ].map(([href, label]) => (
            <li key={href}>
              <Button variant="outline" size="sm" render={<Link href={href} />} nativeButton={false}>
                {label}
              </Button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/* ---------------- One group's reports ---------------- */

type Option = { id: string; name: string };

/** The report pages keep every filter in the URL, so a view can be bookmarked or shared. */
export function ReportGroupView({ group }: { group: ReportGroup }) {
  const settings = useSettings();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const reports = REPORTS.filter((r) => r.group === group);
  const def = reports.find((r) => r.id === params.get("report")) ?? reports[0];

  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    router.replace(`${pathname}?${next}`, { scroll: false });
  };

  return (
    <div className="flex flex-col gap-4">
      <ReportsNav />
      <nav aria-label={`${REPORT_GROUPS[group].label} reports`} className="flex flex-wrap gap-2">
        {reports.map((r) => (
          <Button
            key={r.id}
            size="sm"
            variant={r.id === def.id ? "secondary" : "ghost"}
            aria-current={r.id === def.id ? "page" : undefined}
            onClick={() => set({ report: r.id, status: null, groupBy: null })}
          >
            {r.label}
          </Button>
        ))}
      </nav>
      {settings.status === "loading" ? (
        <ListSkeleton />
      ) : !settings.data ? (
        <LoadError message={settings.error.message} onRetry={settings.reload} />
      ) : (
        <ReportBody
          key={def.id}
          reportId={def.id}
          filters={def.filters}
          description={def.description}
          values={{
            from: params.get("from") ?? settings.data.financialYear.from,
            to: params.get("to") ?? settings.data.today,
            groupBy: params.get("groupBy") ?? "month",
            customerId: params.get("customerId") ?? "",
            supplierId: params.get("supplierId") ?? "",
            warehouseId: params.get("warehouseId") ?? "",
            productId: params.get("productId") ?? "",
            asOf: params.get("asOf") ?? settings.data.today,
            status: params.get("status") ?? "",
          }}
          onChange={set}
          settings={settings.data}
        />
      )}
    </div>
  );
}

type Values = { from: string; to: string; asOf: string; groupBy: string; customerId: string; supplierId: string; warehouseId: string; productId: string; status: string };

function ReportBody({
  reportId,
  filters,
  description,
  values,
  onChange,
  settings,
}: {
  reportId: string;
  filters: readonly string[];
  description: string;
  values: Values;
  onChange: (patch: Record<string, string | null>) => void;
  settings: NonNullable<ReturnType<typeof useSettings>["data"]>;
}) {
  const has = (f: string) => filters.includes(f);

  const query = new URLSearchParams();
  if (has("period")) {
    query.set("from", values.from);
    query.set("to", values.to);
  }
  if (has("groupBy")) query.set("groupBy", values.groupBy);
  if (has("customer") && values.customerId) query.set("customerId", values.customerId);
  if (has("supplier") && values.supplierId) query.set("supplierId", values.supplierId);
  if (has("asOf")) query.set("asOf", values.asOf);
  if (has("warehouse") && values.warehouseId) query.set("warehouseId", values.warehouseId);
  if (has("product") && values.productId) query.set("productId", values.productId);
  if ((has("invoiceStatus") || has("paymentStatus")) && values.status) query.set("status", values.status);

  return (
    <>
      <p className="text-sm text-muted-foreground">{description}</p>
      <div className="flex flex-col gap-4 rounded-xl border p-4">
        {has("period") ? <PeriodPicker from={values.from} to={values.to} settings={settings} onChange={(from, to) => onChange({ from, to })} /> : null}
        {has("asOf") ? <AsOfPicker asOf={values.asOf} settings={settings} onChange={(asOf) => onChange({ asOf })} /> : null}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {has("groupBy") ? (
            <SelectField id="rep-group" label="Group by" value={values.groupBy} onValue={(v) => onChange({ groupBy: v || "month" })} options={GROUP_BY.map((g) => ({ value: g, label: GROUP_BY_LABELS[g] }))} />
          ) : null}
          {has("customer") ? (
            <PartyFilter kind="customers" value={values.customerId} onValue={(v) => onChange({ customerId: v || null })} />
          ) : null}
          {has("supplier") ? (
            <PartyFilter kind="suppliers" value={values.supplierId} onValue={(v) => onChange({ supplierId: v || null })} />
          ) : null}
          {has("warehouse") ? <WarehouseFilter value={values.warehouseId} onValue={(v) => onChange({ warehouseId: v || null })} /> : null}
          {has("product") ? <ProductFilter value={values.productId} onValue={(v) => onChange({ productId: v || null })} /> : null}
          {has("invoiceStatus") || has("paymentStatus") ? (
            <SelectField
              id="rep-status"
              label="Status"
              value={values.status}
              onValue={(v) => onChange({ status: v || null })}
              options={(has("invoiceStatus") ? INVOICE_STATUS_FILTERS : PAYMENT_STATUS_FILTERS).filter((s) => s.value).map((s) => ({ value: s.value, label: s.label }))}
              noneLabel="All (not void)"
            />
          ) : null}
        </div>
      </div>
      <ReportResult reportId={reportId} query={query.toString()} />
    </>
  );
}

/** All customers or suppliers (including archived), for a report filter. */
export function PartyFilter({ kind, value, onValue, id = `rep-${kind}` }: { kind: "customers" | "suppliers"; value: string; onValue: (v: string) => void; id?: string }) {
  const list = useApiQuery<{ items: Option[] }>(`/api/business-billing/${kind}?pageSize=200&status=all`);
  return (
    <SelectField
      id={id}
      label={kind === "customers" ? "Customer" : "Supplier"}
      value={value}
      onValue={onValue}
      noneLabel={kind === "customers" ? "All customers" : "All suppliers"}
      placeholder={list.status === "loading" ? "Loading…" : undefined}
      options={(list.data?.items ?? []).map((c) => ({ value: c.id, label: c.name }))}
    />
  );
}

/** All warehouses (including archived), for a report filter. */
function WarehouseFilter({ value, onValue }: { value: string; onValue: (v: string) => void }) {
  const list = useApiQuery<{ items: Option[] }>("/api/business-billing/warehouses?status=all");
  return (
    <SelectField id="rep-warehouse" label="Warehouse" value={value} onValue={onValue} noneLabel="All warehouses" placeholder={list.status === "loading" ? "Loading…" : undefined} options={(list.data?.items ?? []).map((w) => ({ value: w.id, label: w.name }))} />
  );
}

/** Products that track stock, for a report filter. */
function ProductFilter({ value, onValue }: { value: string; onValue: (v: string) => void }) {
  const list = useApiQuery<{ items: Option[] }>("/api/business-billing/stock?pageSize=200");
  return (
    <SelectField id="rep-product" label="Product" value={value} onValue={onValue} noneLabel="All products" placeholder={list.status === "loading" ? "Loading…" : undefined} options={(list.data?.items ?? []).map((p) => ({ value: p.id, label: p.name }))} />
  );
}

/** Fetches and shows one report, with its downloads. */
export function ReportResult({ reportId, query }: { reportId: string; query: string }) {
  const q = useApiQuery<ReportTable>(`${API}/${reportId}?${query}`);
  if (q.status === "loading") return <ListSkeleton />;
  if (!q.data) return <LoadError message={q.error.message} onRetry={q.reload} />;
  const t = q.data;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-semibold">{t.title}</h2>
          <p className="text-sm text-muted-foreground">{t.subtitle}</p>
        </div>
        <ExportButtons reportId={reportId} query={query} disabled={t.rows.length === 0} />
      </div>
      {t.rows.length === 0 ? (
        <EmptyList Icon={BarChart3Icon} title="Nothing in this period" description="Try a longer period or clear the filters." filtered={false} />
      ) : (
        <ReportTableView table={t} />
      )}
      {t.truncated ? <p className="text-sm text-muted-foreground">Showing the first 5,000 rows. Download the file or choose a shorter period for the rest.</p> : null}
      {t.note ? <p className="text-xs text-muted-foreground">{t.note}</p> : null}
    </div>
  );
}

function show(v: Cell | undefined, c: Column) {
  if (v === null || v === undefined || v === "") return c.type === "money" ? "" : "—";
  if (c.type === "money" && typeof v === "number") return formatPaise(v);
  if (c.type === "date" && typeof v === "string") return fmtDate(v);
  if (c.type === "percent" && typeof v === "number") return `${v.toFixed(2)}%`;
  if (c.type === "number" && typeof v === "number") return v.toLocaleString("en-IN");
  return String(v);
}
const numeric = (c: Column) => c.type === "money" || c.type === "number" || c.type === "percent";

export function ReportTableView({ table: t }: { table: ReportTable }) {
  const hide = (c: Column) => (c.secondary ? "hidden lg:table-cell" : "");
  return (
    <div className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            {t.columns.map((c) => (
              <TableHead key={c.key} className={cn(numeric(c) && "text-right", hide(c))}>
                {c.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {t.rows.map((r, i) => (
            <TableRow key={i} className={r._strong === 1 ? "bg-muted/40 font-medium" : undefined}>
              {t.columns.map((c, j) => (
                <TableCell key={c.key} className={cn(numeric(c) && "text-right tabular-nums", c.type === "date" && "whitespace-nowrap", hide(c), typeof r[c.key] === "number" && (r[c.key] as number) < 0 && c.type === "money" && "text-destructive")}>
                  {j === 0 && typeof r._href === "string" ? (
                    <Link href={r._href} className="font-medium hover:underline">
                      {show(r[c.key], c)}
                    </Link>
                  ) : (
                    show(r[c.key], c)
                  )}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
        {t.totals ? (
          <TableFooter>
            <TableRow>
              {t.columns.map((c) => (
                <TableCell key={c.key} className={cn(numeric(c) && "text-right tabular-nums", hide(c))}>
                  {t.totals![c.key] === undefined || t.totals![c.key] === null ? "" : show(t.totals![c.key], c)}
                </TableCell>
              ))}
            </TableRow>
          </TableFooter>
        ) : null}
      </Table>
    </div>
  );
}

