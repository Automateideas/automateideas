"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { HistoryIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useApiQuery } from "@/lib/api";

import { LoadError } from "../../_components/page-parts";
import { EmptyList, ListSkeleton, Pager } from "./records-ui";
import { SettingsNav } from "./tax-settings";

type Row = { id: string; at: string; action: string; entityType: string; entityId: string | null; actor: string; actorEmail: string | null; ipAddress: string | null; details: { method?: string; path?: string; body?: unknown } | null };

const ENTITY: Record<string, string> = {
  invoices: "Invoice",
  quotations: "Quotation",
  "sales-orders": "Sales order",
  "credit-notes": "Credit note",
  "debit-notes": "Debit note",
  "purchase-orders": "Purchase order",
  "purchase-bills": "Purchase bill",
  "purchase-returns": "Purchase return",
  payments: "Payment",
  refunds: "Refund",
  "supplier-payments": "Supplier payment",
  customers: "Customer",
  suppliers: "Supplier",
  products: "Product",
  services: "Service",
  categories: "Category",
  units: "Unit",
  "price-lists": "Price list",
  accounting: "Accounting",
  "stock-adjustments": "Stock adjustment",
  warehouses: "Warehouse",
  "recurring-invoices": "Recurring invoice",
  whatsapp: "WhatsApp",
  settings: "Company settings",
  "tax-settings": "Tax settings",
  numbering: "Numbering",
  template: "Template",
  branding: "Branding",
  "communication-settings": "Email and reminders",
  "inventory-settings": "Stock rules",
};
const VERB: Record<string, string> = {
  create: "created",
  update: "edited",
  delete: "deleted",
  issue: "issued",
  void: "voided",
  archive: "archived or restored",
  email: "emailed",
  whatsapp: "sent on WhatsApp",
  share: "shared a link",
  remind: "sent a reminder",
  convert: "converted",
  allocate: "applied",
  run: "created the next invoice",
  status: "changed status",
  connect: "connected",
  default: "made default",
  template: "changed items",
  reverse: "reversed",
  backfill: "posted earlier records",
  received: "marked received",
  respond: "recorded the response",
  items: "edited items",
  journal: "posted a journal entry",
  accounts: "added an account",
};
const LINKABLE = new Set(["invoices", "quotations", "sales-orders", "credit-notes", "debit-notes", "purchase-orders", "purchase-bills", "purchase-returns", "payments", "supplier-payments", "customers", "suppliers", "products", "services", "stock-adjustments", "recurring-invoices"]);
const when = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

function describe(r: Row) {
  const [, verb = ""] = r.action.split(".");
  return `${ENTITY[r.entityType] ?? r.entityType} ${VERB[verb] ?? verb}`.trim();
}

/** Every change made in Business Billing: who, what, when and from where (owners and admins). */
export function ActivityLog() {
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const q = useApiQuery<{ items: Row[]; total: number; page: number; pageSize: number }>(`/api/business-billing/audit-logs?page=${page}`);
  return (
    <div className="flex flex-col gap-6">
      <SettingsNav />
      <p className="text-sm text-muted-foreground">Every change made in Billing, newest first. Entries can&apos;t be edited or deleted.</p>
      {q.status === "loading" ? (
        <ListSkeleton />
      ) : !q.data ? (
        <LoadError message={q.error.message} onRetry={q.reload} />
      ) : q.data.items.length === 0 ? (
        <EmptyList Icon={HistoryIcon} title="No activity yet" description="Changes to invoices, payments, settings and more appear here." filtered={false} />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Who</TableHead>
                  <TableHead>What</TableHead>
                  <TableHead className="hidden md:table-cell">From</TableHead>
                  <TableHead>
                    <span className="sr-only">Details</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.data.items.map((r) => (
                  <Fragment key={r.id}>
                    <TableRow>
                      <TableCell className="whitespace-nowrap">{when.format(new Date(r.at))}</TableCell>
                      <TableCell>
                        {r.actor}
                        {r.actorEmail ? <span className="block text-xs text-muted-foreground">{r.actorEmail}</span> : null}
                      </TableCell>
                      <TableCell>
                        {r.entityId && LINKABLE.has(r.entityType) ? (
                          <Link href={`/billing/${r.entityType}/${r.entityId}`} className="hover:underline">
                            {describe(r)}
                          </Link>
                        ) : (
                          describe(r)
                        )}
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted-foreground md:table-cell">{r.ipAddress ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" aria-expanded={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)}>
                          {open === r.id ? "Hide" : "Details"}
                        </Button>
                      </TableCell>
                    </TableRow>
                    {open === r.id ? (
                      <TableRow>
                        <TableCell colSpan={5} className="bg-muted/40">
                          <pre className="max-h-72 overflow-auto text-xs whitespace-pre-wrap">{JSON.stringify(r.details, null, 2)}</pre>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pager page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={setPage} />
        </>
      )}
    </div>
  );
}
