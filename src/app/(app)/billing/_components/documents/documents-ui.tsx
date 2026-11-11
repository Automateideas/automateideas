"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRightLeftIcon, BanIcon, DownloadIcon, CheckIcon, FileTextIcon, PencilIcon, PlusIcon, PrinterIcon, SendIcon, Trash2Icon, XIcon } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError, api, useApiQuery } from "@/lib/api";
import { DOCUMENT_TYPES, type DocumentSlug, SALES_SLUGS, STATUS_LABELS } from "@/lib/business-billing/documents/types";
import { SENDABLE_DOCUMENTS } from "@/lib/business-billing/communication/settings";
import { formatPaise } from "@/lib/business-billing/fields";
import type { DocumentTemplate } from "@/lib/business-billing/template";

import { LoadError } from "../../../_components/page-parts";
import { SectionNav } from "../../../_components/section-nav";
import { BackLink, EmptyList, ListSkeleton, ListToolbar, Pager, ReadOnlyNote, SelectField, TextField, useRecordList } from "../records-ui";
import { InvoicePaymentPanel, type InvoicePayment } from "../payments";
import { BillPaymentPanel } from "../supplier-payments";
import { SendCard } from "../communication-ui";
import { DocumentPaper, type PaperDocument, type PaperLook, type Seller } from "./document-paper";

const BASE = "/api/business-billing/documents";

/** Invoices · Quotations · Sales orders · Credit notes · Debit notes. */
export function SalesNav() {
  return <SectionNav label="Sales documents" links={SALES_SLUGS.map((s) => ({ href: `/billing/${s}`, label: DOCUMENT_TYPES[s].plural, matchNested: true }))} />;
}

/** Bills · Purchase orders · Returns · Supplier payments · Payables. */
export function PurchasesNav() {
  return (
    <SectionNav
      label="Purchases"
      links={[
        { href: "/billing/purchase-bills", label: "Bills", matchNested: true },
        { href: "/billing/purchase-orders", label: "Purchase orders", matchNested: true },
        { href: "/billing/purchase-returns", label: "Returns", matchNested: true },
        { href: "/billing/supplier-payments", label: "Supplier payments", matchNested: true },
        { href: "/billing/payables", label: "Payables" },
      ]}
    />
  );
}

const GroupNav = ({ slug }: { slug: DocumentSlug }) => (DOCUMENT_TYPES[slug].group === "purchases" ? <PurchasesNav /> : <SalesNav />);

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "secondary",
  void: "outline",
  overdue: "destructive",
  declined: "outline",
  expired: "outline",
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge variant={STATUS_VARIANT[status] ?? "default"}>{STATUS_LABELS[status] ?? status}</Badge>;
}

const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
export const fmtDate = (d: string | null) => (d ? dateFmt.format(new Date(`${d}T00:00:00Z`)) : "—");

/* ---------------- List ---------------- */

type Row = { id: string; number: string | null; status: string; displayStatus: string; issueDate: string; extraDate: string | null; partyName: string | null; partyReference: string | null; totalPaise: number };

export function DocumentsList({ slug }: { slug: DocumentSlug }) {
  const type = DOCUMENT_TYPES[slug];
  const [status, setStatus] = useState("");
  const list = useRecordList<Row>(`${BASE}/${slug}`, { status: status || null });
  const { query } = list;
  const canEdit = query.data?.canEdit ?? false;
  const statusOptions = [
    { value: "open", label: "All issued" },
    ...(slug === "invoices" || slug === "purchase-bills" ? [{ value: "overdue", label: "Overdue" }] : []),
    ...(slug === "quotations" ? [{ value: "expired", label: "Expired" }] : []),
    ...type.statuses.map((s) => ({ value: s, label: STATUS_LABELS[s] ?? s })),
  ];
  const add = type.needsInvoice ? null : (
    <Button render={<Link href={`/billing/${slug}/create`} />} nativeButton={false}>
      <PlusIcon data-icon="inline-start" />
      New {type.singular.toLowerCase()}
    </Button>
  );

  return (
    <div className="flex flex-col gap-4">
      <GroupNav slug={slug} />
      <ListToolbar search={list.search} onSearch={list.setSearch} placeholder={type.partyReference ? "Search number, supplier or their bill no." : `Search number or ${type.party}`}>
        <SelectField
          id="doc-status"
          label="Status"
          value={status}
          onValue={(v) => {
            setStatus(v);
            list.setPage(1);
          }}
          options={statusOptions}
          noneLabel="All"
          className="w-full gap-1 sm:w-40 [&>label]:sr-only"
        />
        {canEdit ? add : null}
      </ListToolbar>
      {type.needsInvoice ? (
        <p className="text-sm text-muted-foreground">
          To raise a {type.singular.toLowerCase()}, open the {type.source ? DOCUMENT_TYPES[type.source].singular.toLowerCase() : "document"} it adjusts and choose “Create {type.singular.toLowerCase()}”.
        </p>
      ) : null}
      {query.data && !query.data.canEdit ? <ReadOnlyNote reason={query.data.readOnlyReason} /> : null}
      {query.status === "loading" ? (
        <ListSkeleton />
      ) : !query.data ? (
        <LoadError message={query.error.message} onRetry={query.reload} />
      ) : query.data.items.length === 0 ? (
        <EmptyList
          Icon={FileTextIcon}
          title={`No ${type.plural.toLowerCase()} yet`}
          description={type.needsInvoice ? `They're created from ${type.source ? DOCUMENT_TYPES[type.source].plural.toLowerCase() : "issued documents"}.` : `Create a ${type.singular.toLowerCase()} for one of your ${type.party}s.`}
          filtered={list.filtered || !!status}
          action={canEdit ? add ?? undefined : undefined}
        />
      ) : (
        <>
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>{type.party === "customer" ? "Customer" : "Supplier"}</TableHead>
                  {type.partyReference ? <TableHead className="hidden md:table-cell">{type.partyReference.label}</TableHead> : null}
                  <TableHead className="hidden sm:table-cell">Date</TableHead>
                  {type.extraDate ? <TableHead className="hidden lg:table-cell">{type.extraDate.label}</TableHead> : null}
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.items.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>
                      <Link href={`/billing/${slug}/${d.id}`} className="font-mono text-xs font-medium text-foreground hover:underline">
                        {d.number ?? "Draft"}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-48 truncate">{d.partyName}</TableCell>
                    {type.partyReference ? <TableCell className="hidden font-mono text-xs md:table-cell">{d.partyReference ?? "—"}</TableCell> : null}
                    <TableCell className="hidden sm:table-cell">{fmtDate(d.issueDate)}</TableCell>
                    {type.extraDate ? <TableCell className="hidden lg:table-cell">{fmtDate(d.extraDate)}</TableCell> : null}
                    <TableCell>
                      <StatusBadge status={d.displayStatus} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatPaise(d.totalPaise)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pager page={list.page} pageSize={query.data.pageSize} total={query.data.total} onPage={list.setPage} />
        </>
      )}
    </div>
  );
}

/* ---------------- Detail ---------------- */

type Actions = { canEdit: boolean; readOnlyReason: string | null; edit: boolean; delete: boolean; issue: boolean; void: boolean; respond: boolean; markReceived: boolean; convertTo: DocumentSlug[] };
type Detail = Omit<PaperDocument, "related"> & {
  id: string;
  partyId: string;
  customerId: string | null;
  supplierId: string | null;
  payment: InvoicePayment | null;
  displayStatus: string;
  related: { slug: DocumentSlug; id: string; number: string | null; status: string; totalPaise: number }[];
  voidedAt: string | null;
  warehouseName?: string | null;
  restock?: boolean;
  actions: Actions;
};
type Branding = { logoOnDocuments: boolean; logoUrl: string | null };
type TemplateInfo = { template: DocumentTemplate; signatureUrl: string | null; stampUrl: string | null };

/** Company details for drafts (issued documents carry their own copy). */
export function useDocumentContext() {
  const company = useApiQuery<Seller & { configured: boolean }>("/api/business-billing/settings");
  const branding = useApiQuery<Branding>("/api/business-billing/branding");
  const template = useApiQuery<TemplateInfo>("/api/business-billing/template");
  const look: PaperLook | undefined = template.data ? { template: template.data.template, signatureUrl: template.data.signatureUrl, stampUrl: template.data.stampUrl } : undefined;
  return {
    company: company.data?.configured ? company.data : null,
    logoUrl: branding.data?.logoOnDocuments ? branding.data.logoUrl : null,
    look,
    ready: company.status !== "loading" && branding.status !== "loading" && template.status !== "loading",
  };
}

function takeIssueError(id: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const key = `issue-error:${id}`;
    const msg = sessionStorage.getItem(key);
    if (!msg) return null;
    sessionStorage.removeItem(key);
    return `Saved as a draft, but not issued: ${msg}`;
  } catch {
    return null;
  }
}

export function DocumentView({ slug, id }: { slug: DocumentSlug; id: string }) {
  const type = DOCUMENT_TYPES[slug];
  const router = useRouter();
  const query = useApiQuery<Detail>(`${BASE}/${slug}/${id}`);
  const ctx = useDocumentContext();
  const [pending, start] = useTransition();
  // "Save and issue" saved the draft but couldn't issue it: say why, once.
  const [error, setError] = useState<string | null>(() => takeIssueError(id));
  const [dialog, setDialog] = useState<"issue" | "void" | "delete" | null>(null);
  const [voidReason, setVoidReason] = useState("");

  if (query.status === "loading" || !ctx.ready) return <Skeleton className="h-160 max-w-4xl rounded-xl" aria-label="Loading" />;
  if (!query.data) return <LoadError message={query.error.message} onRetry={query.reload} />;
  const doc = query.data;
  const a = doc.actions;

  const run = (fn: () => Promise<unknown>, after?: () => void) =>
    start(async () => {
      setError(null);
      try {
        await fn();
        setDialog(null);
        if (after) after();
        else query.reload();
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Something went wrong. Try again.");
      }
    });

  return (
    <div className="flex max-w-5xl flex-col gap-5">
      <BackLink href={`/billing/${slug}`}>Back to {type.plural.toLowerCase()}</BackLink>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
            {type.singular} <span className="font-mono">{doc.number ?? "(draft)"}</span>
            <StatusBadge status={doc.displayStatus} />
          </h2>
          <p className="text-sm text-muted-foreground">
            <Link href={`/billing/${type.party === "customer" ? "customers" : "suppliers"}/${doc.partyId}`} className="hover:underline">{doc.partyName}</Link>
            {doc.partyReference ? <> · their no. <span className="font-mono">{doc.partyReference}</span></> : null} · {formatPaise(doc.totalPaise)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {a.issue ? (
            <Button onClick={() => setDialog("issue")} disabled={pending}>
              <SendIcon data-icon="inline-start" />
              {type.issueLabel}
            </Button>
          ) : null}
          {a.edit ? (
            <Button variant="outline" render={<Link href={`/billing/${slug}/${id}/edit`} />} nativeButton={false}>
              <PencilIcon data-icon="inline-start" />
              Edit
            </Button>
          ) : null}
          {a.respond ? (
            <>
              {doc.status !== "accepted" ? (
                <Button variant="outline" onClick={() => run(() => api(`${BASE}/${slug}/${id}/respond`, { method: "POST", json: { status: "accepted" } }))} disabled={pending}>
                  <CheckIcon data-icon="inline-start" />
                  Accepted
                </Button>
              ) : null}
              {doc.status !== "declined" ? (
                <Button variant="outline" onClick={() => run(() => api(`${BASE}/${slug}/${id}/respond`, { method: "POST", json: { status: "declined" } }))} disabled={pending}>
                  <XIcon data-icon="inline-start" />
                  Declined
                </Button>
              ) : null}
            </>
          ) : null}
          {a.markReceived ? (
            <Button variant="outline" onClick={() => run(() => api(`${BASE}/${slug}/${id}/received`, { method: "POST" }))} disabled={pending}>
              <CheckIcon data-icon="inline-start" />
              Mark received
            </Button>
          ) : null}
          {a.convertTo.map((to) => (
            <Button
              key={to}
              variant="outline"
              disabled={pending}
              onClick={() =>
                run(
                  async () => {
                    const draft = await api<{ id: string }>(`${BASE}/${slug}/${id}/convert`, { method: "POST", json: { to } });
                    router.push(`/billing/${to}/${draft.id}/edit`);
                  },
                  () => undefined,
                )
              }
            >
              <ArrowRightLeftIcon data-icon="inline-start" />
              Create {DOCUMENT_TYPES[to].singular.toLowerCase()}
            </Button>
          ))}
          <Button variant="outline" render={<a href={`/api/business-billing/documents/${slug}/${id}/pdf?download=1`} />} nativeButton={false}>
            <DownloadIcon data-icon="inline-start" />
            Download PDF
          </Button>
          <Button variant="outline" render={<Link href={`/billing/print/${slug}/${id}`} target="_blank" />} nativeButton={false}>
            <PrinterIcon data-icon="inline-start" />
            Print
          </Button>
          {a.void ? (
            <Button variant="outline" onClick={() => setDialog("void")} disabled={pending}>
              <BanIcon data-icon="inline-start" />
              Void
            </Button>
          ) : null}
          {a.delete ? (
            <Button variant="ghost" onClick={() => setDialog("delete")} disabled={pending} aria-label="Delete draft">
              <Trash2Icon />
            </Button>
          ) : null}
        </div>
      </div>

      {!a.canEdit && a.readOnlyReason ? <ReadOnlyNote reason={a.readOnlyReason} /> : null}
      {error && !dialog ? (
        <Alert variant="destructive">
          <AlertTitle>That didn&apos;t work</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {doc.status === "void" ? (
        <Alert>
          <BanIcon />
          <AlertTitle>Void</AlertTitle>
          <AlertDescription>{doc.voidReason}. The number stays used; this document no longer counts.</AlertDescription>
        </Alert>
      ) : null}
      {doc.status !== "draft" && doc.warehouseName ? (
        <p className="text-sm text-muted-foreground">
          {slug === "credit-notes" && doc.restock === false
            ? "Price-only credit note: stock wasn't changed."
            : `Stock for tracked products ${slug === "invoices" || slug === "purchase-returns" ? "left" : "went into"} ${doc.warehouseName}${doc.status === "void" ? " (reversed when voided)" : ""}.`}
        </p>
      ) : null}
      {doc.status === "draft" ? (
        <p className="text-sm text-muted-foreground">Draft: no number yet, and you can still change everything. Issuing gives it a number and locks it.</p>
      ) : null}

      {doc.related.length ? (
        <Card size="sm">
          <CardHeader>
            <CardTitle>Related documents</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-1.5 text-sm">
              {doc.related.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-2">
                  <span className="text-muted-foreground">{DOCUMENT_TYPES[r.slug].singular}</span>
                  <Link href={`/billing/${r.slug}/${r.id}`} className="font-mono font-medium hover:underline">
                    {r.number ?? "Draft"}
                  </Link>
                  <StatusBadge status={r.status} />
                  <span className="tabular-nums">{formatPaise(r.totalPaise)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {doc.status !== "draft" && doc.status !== "void" && (SENDABLE_DOCUMENTS as readonly string[]).includes(slug) ? (
        <SendCard
          base={`${BASE}/${slug}/${doc.id}`}
          title={DOCUMENT_TYPES[slug].party === "supplier" ? "Send to supplier" : "Send to customer"}
          canSend={a.canEdit}
          reminder={slug === "invoices" && (doc.payment?.balancePaise ?? 0) > 0}
        />
      ) : null}

      {doc.payment && slug === "purchase-bills" ? (
        <BillPaymentPanel billId={doc.id} supplierId={doc.partyId} status={doc.status} payment={doc.payment} canRecord={a.canEdit} />
      ) : null}
      {doc.payment && slug === "invoices" ? (
        <InvoicePaymentPanel
          invoiceId={doc.id}
          customerId={doc.partyId}
          status={doc.status}
          payment={doc.payment}
          canRecord={a.canEdit}
          creditNotes={doc.related.filter((r) => r.slug === "credit-notes" && r.status === "issued")}
          onChanged={query.reload}
        />
      ) : null}

      <div className="overflow-x-auto rounded-xl bg-muted/40 p-2 sm:p-6">
        <DocumentPaper doc={doc} company={ctx.company} logoUrl={ctx.logoUrl} look={ctx.look} />
      </div>

      <AlertDialog open={dialog === "issue"} onOpenChange={(o: boolean) => !o && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{type.issueLabel}?</AlertDialogTitle>
            <AlertDialogDescription>
              It gets the next {type.singular.toLowerCase()} number and is then locked: it can&apos;t be edited or deleted, only voided
              {slug === "invoices" ? " or corrected with a credit or debit note" : slug === "purchase-bills" ? " or adjusted with a purchase return" : ""}. GST is recalculated with your current tax settings.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => run(() => api(`${BASE}/${slug}/${id}/issue`, { method: "POST" }))} disabled={pending}>
              {pending ? <Spinner data-icon="inline-start" /> : null}
              {type.issueLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={dialog === "void"} onOpenChange={(o: boolean) => !o && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void {type.singular.toLowerCase()} {doc.number}?</AlertDialogTitle>
            <AlertDialogDescription>It stays on record with its number, marked void. This can&apos;t be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <TextField id="void-reason" label="Reason" value={voidReason} onValue={setVoidReason} placeholder="e.g. Raised by mistake" maxLength={300} />
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => run(() => api(`${BASE}/${slug}/${id}/void`, { method: "POST", json: { reason: voidReason } }))} disabled={pending || !voidReason.trim()}>
              {pending ? <Spinner data-icon="inline-start" /> : null}
              Void
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={dialog === "delete"} onOpenChange={(o: boolean) => !o && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this draft?</AlertDialogTitle>
            <AlertDialogDescription>Drafts have no number yet, so nothing is lost from your records.</AlertDialogDescription>
          </AlertDialogHeader>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => run(() => api(`${BASE}/${slug}/${id}`, { method: "DELETE" }), () => router.push(`/billing/${slug}`))} disabled={pending}>
              Delete draft
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** /billing/print/:type/:id: just the document, with a print button. */
export function PrintView({ slug, id }: { slug: DocumentSlug; id: string }) {
  const query = useApiQuery<Detail>(`${BASE}/${slug}/${id}`);
  const ctx = useDocumentContext();
  if (query.status === "loading" || !ctx.ready) return <p className="p-8 text-sm text-neutral-500">Loading…</p>;
  if (!query.data) return <div className="p-8"><LoadError message={query.error.message} onRetry={query.reload} /></div>;
  return (
    <div className="min-h-dvh bg-neutral-100 py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] justify-end gap-2 px-4 print:hidden">
        <Button variant="outline" render={<a href={`/api/business-billing/documents/${slug}/${id}/pdf?download=1`} />} nativeButton={false}>
          <DownloadIcon data-icon="inline-start" />
          Download PDF
        </Button>
        <Button onClick={() => window.print()}>
          <PrinterIcon data-icon="inline-start" />
          Print or save as PDF
        </Button>
      </div>
      <DocumentPaper doc={query.data} company={ctx.company} logoUrl={ctx.logoUrl} look={ctx.look} />
    </div>
  );
}
