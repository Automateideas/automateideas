"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BanIcon, DownloadIcon, PlusIcon, PrinterIcon, Undo2Icon, WalletIcon } from "lucide-react";

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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, api, useApiQuery } from "@/lib/api";
import { amountInWords, todayInIndia } from "@/lib/business-billing/documents/types";
import { formatPaise, paiseToRupees } from "@/lib/business-billing/fields";
import { PAYMENT_METHOD_OPTIONS, methodLabel, validatePayment, validateRefund } from "@/lib/business-billing/payments/validation";

import { LoadError } from "../../_components/page-parts";
import { SectionNav } from "../../_components/section-nav";
import { StatusBadge, fmtDate, useDocumentContext } from "./documents/documents-ui";
import { BackLink, EmptyList, type Errors, ListSkeleton, ListToolbar, MoneyField, Pager, ReadOnlyNote, SelectField, TextField, focusFirstError, saveError, useRecordList } from "./records-ui";

const BASE = "/api/business-billing";
const newKey = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

/** Rupee string → paise, or null (for live totals; the server re-checks everything). */
function toPaise(v: string): number | null {
  const m = /^(\d{1,13})(?:\.(\d{1,2}))?$/.exec(v.replace(/[,\s₹]/g, ""));
  return m ? Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0")) : null;
}

/** POST with an idempotency key, so a double click or retry can't record twice. */
async function postOnce<T>(path: string, key: string, json: unknown) {
  return api<T>(path, { method: "POST", json, headers: { "Idempotency-Key": key } });
}

export function PaymentsNav() {
  return (
    <SectionNav
      label="Payments"
      links={[
        { href: "/billing/payments", label: "Payments received", matchNested: true },
        { href: "/billing/refunds", label: "Refunds", matchNested: true },
        { href: "/billing/outstanding", label: "Outstanding" },
      ]}
    />
  );
}

/* ---------------- List ---------------- */

type PaymentRow = { id: string; number: string | null; status: string; paymentDate: string; amountPaise: number; method: string; reference: string | null; customerName: string; unallocatedPaise: number };

export function PaymentsList() {
  const list = useRecordList<PaymentRow>(`${BASE}/payments`);
  const { query } = list;
  const canEdit = query.data?.canEdit ?? false;
  const add = (
    <Button render={<Link href="/billing/payments/create" />} nativeButton={false}>
      <PlusIcon data-icon="inline-start" />
      Record payment
    </Button>
  );
  return (
    <div className="flex flex-col gap-4">
      <PaymentsNav />
      <ListToolbar search={list.search} onSearch={list.setSearch} placeholder="Search receipt, reference or customer" status={list.status} onStatus={list.setStatus}>
        {canEdit ? add : null}
      </ListToolbar>
      <p className="text-xs text-muted-foreground">“Archived” shows void payments.</p>
      {query.data && !canEdit ? <ReadOnlyNote reason={query.data.readOnlyReason} /> : null}
      {query.status === "loading" ? (
        <ListSkeleton />
      ) : !query.data ? (
        <LoadError message={query.error.message} onRetry={query.reload} />
      ) : query.data.items.length === 0 ? (
        <EmptyList Icon={WalletIcon} title="No payments yet" description="Record money received from customers and settle their invoices." filtered={list.filtered} action={canEdit ? add : undefined} />
      ) : (
        <>
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Receipt</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="hidden sm:table-cell">Date</TableHead>
                  <TableHead className="hidden md:table-cell">Method</TableHead>
                  <TableHead className="hidden lg:table-cell text-right">Advance</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.items.map((p) => (
                  <TableRow key={p.id} className={p.status === "void" ? "text-muted-foreground" : undefined}>
                    <TableCell>
                      <Link href={`/billing/payments/${p.id}`} className="font-mono text-xs font-medium text-foreground hover:underline">
                        {p.number}
                      </Link>
                      {p.status === "void" ? <Badge variant="outline" className="ml-2">Void</Badge> : null}
                    </TableCell>
                    <TableCell className="max-w-48 truncate">{p.customerName}</TableCell>
                    <TableCell className="hidden sm:table-cell">{fmtDate(p.paymentDate)}</TableCell>
                    <TableCell className="hidden md:table-cell">{methodLabel(p.method)}</TableCell>
                    <TableCell className="hidden lg:table-cell text-right tabular-nums">{p.unallocatedPaise ? formatPaise(p.unallocatedPaise) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatPaise(p.amountPaise)}</TableCell>
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

/* ---------------- Record a payment ---------------- */

type CustomerOption = { id: string; name: string; gstin: string | null };
type OpenInvoice = { id: string; number: string | null; issueDate: string; dueDate: string | null; totalPaise: number; balancePaise: number };
type OpenItems = { invoices: OpenInvoice[]; creditNotes: { id: string; number: string | null; refundablePaise: number }[] };

function CustomerPicker({ value, onChange, error, disabled }: { value: CustomerOption | null; onChange: (c: CustomerOption | null) => void; error?: string; disabled?: boolean }) {
  const customers = useApiQuery<{ items: CustomerOption[] }>(`${BASE}/customers?pageSize=200`);
  // A customer preset by id (e.g. from an invoice) gets its name from the list.
  const resolved = value && !value.name ? (customers.data?.items.find((c) => c.id === value.id) ?? null) : value;
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor="pay-customer">Customer</FieldLabel>
      <Combobox
        items={customers.data?.items ?? []}
        value={resolved}
        onValueChange={(c: CustomerOption | null) => onChange(c)}
        itemToStringLabel={(c: CustomerOption) => c.name}
        isItemEqualToValue={(a: CustomerOption, b: CustomerOption) => a.id === b.id}
        autoHighlight
        disabled={disabled}
      >
        <ComboboxInput id="pay-customer" placeholder="Search customers" className="w-full" aria-invalid={!!error} />
        <ComboboxContent>
          <ComboboxEmpty>No customer matches.</ComboboxEmpty>
          <ComboboxList>
            {(c: CustomerOption) => (
              <ComboboxItem key={c.id} value={c}>
                {c.name}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <FieldError>{error}</FieldError>
    </Field>
  );
}

/** Allocation table: how much of the money goes to each open invoice. */
function AllocationTable({ invoices, amounts, onAmount, errors }: { invoices: OpenInvoice[]; amounts: Record<string, string>; onAmount: (id: string, v: string) => void; errors: Errors }) {
  if (!invoices.length) return <p className="text-sm text-muted-foreground">No unpaid invoices. The whole amount is kept as an advance.</p>;
  return (
    <div className="rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Invoice</TableHead>
            <TableHead className="hidden sm:table-cell">Due</TableHead>
            <TableHead className="hidden md:table-cell text-right">Total</TableHead>
            <TableHead className="text-right">Owes</TableHead>
            <TableHead className="w-36 text-right">Apply</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices.map((inv, i) => {
            const err = errors[`allocations.${i}.amount`] ?? errors[`allocations.${i}.invoiceId`];
            return (
              <TableRow key={inv.id} className="align-top">
                <TableCell className="font-mono text-xs">{inv.number}</TableCell>
                <TableCell className="hidden sm:table-cell">{fmtDate(inv.dueDate ?? inv.issueDate)}</TableCell>
                <TableCell className="hidden md:table-cell text-right tabular-nums">{formatPaise(inv.totalPaise)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatPaise(inv.balancePaise)}</TableCell>
                <TableCell className="text-right">
                  <Input
                    aria-label={`Amount for ${inv.number}`}
                    inputMode="decimal"
                    value={amounts[inv.id] ?? ""}
                    onChange={(e) => onAmount(inv.id, e.target.value.replace(/[^\d.,]/g, ""))}
                    placeholder="0.00"
                    className="ml-auto w-32 text-right tabular-nums"
                    aria-invalid={!!err}
                  />
                  {err ? <p className="mt-1 text-xs text-destructive">{err}</p> : null}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

/** Fills invoices oldest first until the money runs out. */
function autoApply(invoices: OpenInvoice[], totalPaise: number) {
  let left = totalPaise;
  const out: Record<string, string> = {};
  for (const inv of invoices) {
    if (left <= 0) break;
    const take = Math.min(left, inv.balancePaise);
    out[inv.id] = paiseToRupees(take);
    left -= take;
  }
  return out;
}

export function RecordPaymentForm({ customerId: presetCustomer, invoiceId: presetInvoice }: { customerId?: string; invoiceId?: string }) {
  const router = useRouter();
  const [customer, setCustomer] = useState<CustomerOption | null>(presetCustomer ? { id: presetCustomer, name: "", gstin: null } : null);
  const [form, setForm] = useState({ paymentDate: todayInIndia(), amount: "", method: "upi", reference: "", notes: "" });
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // One key per payment being entered: retries of this submit can't record it twice.
  const [key] = useState(newKey);
  const open = useApiQuery<OpenItems>(customer ? `${BASE}/payments/open-items?customerId=${customer.id}` : `${BASE}/payments/open-items`);
  const invoices = customer ? (open.data?.invoices ?? []) : [];
  const [prefilled, setPrefilled] = useState(false);

  // Coming from an invoice: suggest paying that invoice in full (once, when its balance is known).
  if (!prefilled && presetInvoice && invoices.length) {
    const inv = invoices.find((i) => i.id === presetInvoice);
    setPrefilled(true);
    if (inv) {
      setForm((f) => ({ ...f, amount: paiseToRupees(inv.balancePaise) }));
      setAmounts({ [inv.id]: paiseToRupees(inv.balancePaise) });
    }
  }

  const amountPaise = toPaise(form.amount) ?? 0;
  const allocatedPaise = invoices.reduce((a, inv) => a + (toPaise(amounts[inv.id] ?? "") ?? 0), 0);
  const advance = amountPaise - allocatedPaise;
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function payload() {
    return {
      customerId: customer?.id ?? "",
      paymentDate: form.paymentDate,
      amount: form.amount,
      method: form.method,
      reference: form.reference,
      notes: form.notes,
      allocations: invoices.filter((inv) => amounts[inv.id]).map((inv) => ({ invoiceId: inv.id, amount: amounts[inv.id] })),
    };
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const p = payload();
    const local = validatePayment(p);
    if (!local.ok) {
      // Map allocation row errors back to the visible invoice rows.
      const remapped: Errors = {};
      const shown = invoices.filter((inv) => amounts[inv.id]);
      for (const [k, v] of Object.entries(local.errors)) {
        const m = /^allocations\.(\d+)\.(.+)$/.exec(k);
        remapped[m ? `allocations.${invoices.indexOf(shown[Number(m[1])])}.${m[2]}` : k] = v;
      }
      setErrors(remapped);
      focusFirstError();
      return;
    }
    setErrors({});
    start(async () => {
      try {
        const saved = await postOnce<{ id: string }>(`${BASE}/payments`, key, p);
        router.push(`/billing/payments/${saved.id}`);
      } catch (err) {
        setError(saveError(err, setErrors));
      }
    });
  }

  return (
    <form noValidate onSubmit={onSubmit} className="flex max-w-4xl flex-col gap-6">
      <PaymentsNav />
      <BackLink href="/billing/payments">Back to payments</BackLink>
      <h2 className="text-lg font-semibold">Record a payment</h2>
      <Card>
        <CardHeader>
          <CardTitle>Payment</CardTitle>
          <CardDescription>Money you received from a customer.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-5 sm:grid-cols-2">
              <CustomerPicker
                value={customer}
                onChange={(c) => {
                  setCustomer(c);
                  setAmounts({});
                }}
                error={errors.customerId}
              />
              <TextField id="pay-date" label="Date received" type="date" value={form.paymentDate} onValue={(v) => set("paymentDate", v)} error={errors.paymentDate} />
              <MoneyField id="pay-amount" label="Amount received" value={form.amount} onValue={(v) => set("amount", v)} error={errors.amount} />
              <SelectField id="pay-method" label="Method" value={form.method} onValue={(v) => set("method", v || "upi")} options={PAYMENT_METHOD_OPTIONS} error={errors.method} />
              <TextField
                id="pay-ref"
                label={form.method === "cheque" ? "Cheque number" : form.method === "upi" || form.method === "bank_transfer" ? "UTR / transaction ID" : "Reference"}
                optional={!(form.method === "cheque" || form.method === "bank_transfer")}
                value={form.reference}
                onValue={(v) => set("reference", v)}
                error={errors.reference}
              />
            </div>
            <Field>
              <FieldLabel htmlFor="pay-notes">Notes <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel>
              <Textarea id="pay-notes" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      {customer ? (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <CardTitle>Settle invoices</CardTitle>
              <CardDescription>Anything not applied stays with the customer as an advance.</CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setAmounts(autoApply(invoices, amountPaise))} disabled={!amountPaise || !invoices.length}>
              Apply oldest first
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {open.status === "loading" ? <Skeleton className="h-24 rounded-xl" /> : <AllocationTable invoices={invoices} amounts={amounts} onAmount={(id, v) => setAmounts((a) => ({ ...a, [id]: v }))} errors={errors} />}
            {errors.allocations ? <p role="alert" className="text-sm text-destructive">{errors.allocations}</p> : null}
            <dl className="ml-auto grid w-full max-w-xs grid-cols-2 gap-1 text-sm">
              <dt className="text-muted-foreground">Applied to invoices</dt>
              <dd className="text-right tabular-nums">{formatPaise(allocatedPaise)}</dd>
              <dt className={advance < 0 ? "text-destructive" : "text-muted-foreground"}>{advance < 0 ? "Over-applied" : "Kept as advance"}</dt>
              <dd className={`text-right tabular-nums ${advance < 0 ? "text-destructive" : ""}`}>{formatPaise(Math.abs(advance))}</dd>
            </dl>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button type="submit" disabled={pending}>
          {pending ? <Spinner data-icon="inline-start" /> : null}
          Record payment
        </Button>
        <Button variant="ghost" render={<Link href="/billing/payments" />} nativeButton={false}>
          Cancel
        </Button>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      </div>
    </form>
  );
}

/* ---------------- Receipt ---------------- */

type PaymentDetail = {
  id: string;
  number: string | null;
  status: string;
  customerId: string;
  customerName: string;
  paymentDate: string;
  amountPaise: number;
  method: string;
  reference: string | null;
  notes: string | null;
  voidReason: string | null;
  allocations: { id: string; invoiceId: string | null; amountPaise: number; invoiceNumber: string | null; invoiceDate: string }[];
  refunds: { id: string; number: string | null; refundDate: string; amountPaise: number; method: string; status: string }[];
  allocatedPaise: number;
  refundedPaise: number;
  unallocatedPaise: number;
  canEdit: boolean;
  readOnlyReason: string | null;
};

export function PaymentView({ id }: { id: string }) {
  const q = useApiQuery<PaymentDetail>(`${BASE}/payments/${id}`);
  const [dialog, setDialog] = useState<"apply" | "refund" | "void" | null>(null);
  if (q.status === "loading") return <Skeleton className="h-96 max-w-4xl rounded-xl" aria-label="Loading" />;
  if (!q.data) return <LoadError message={q.error.message} onRetry={q.reload} />;
  const p = q.data;
  const live = p.status === "recorded";

  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <PaymentsNav />
      <BackLink href="/billing/payments">Back to payments</BackLink>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
            Receipt <span className="font-mono">{p.number}</span>
            {live ? <Badge>Recorded</Badge> : <Badge variant="outline">Void</Badge>}
          </h2>
          <p className="text-sm text-muted-foreground">
            <Link href={`/billing/customers/${p.customerId}`} className="hover:underline">{p.customerName}</Link> · {formatPaise(p.amountPaise)} · {methodLabel(p.method)} · {fmtDate(p.paymentDate)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {p.canEdit && live && p.unallocatedPaise > 0 ? (
            <>
              <Button onClick={() => setDialog("apply")}>Apply advance</Button>
              <Button variant="outline" onClick={() => setDialog("refund")}>
                <Undo2Icon data-icon="inline-start" />
                Refund advance
              </Button>
            </>
          ) : null}
          <Button variant="outline" render={<a href={`${BASE}/payments/${p.id}/pdf?download=1`} />} nativeButton={false}>
            <DownloadIcon data-icon="inline-start" />
            Receipt PDF
          </Button>
          <Button variant="outline" render={<Link href={`/billing/print/payment/${p.id}`} target="_blank" />} nativeButton={false}>
            <PrinterIcon data-icon="inline-start" />
            Print
          </Button>
          {p.canEdit && live ? (
            <Button variant="outline" onClick={() => setDialog("void")}>
              <BanIcon data-icon="inline-start" />
              Void
            </Button>
          ) : null}
        </div>
      </div>
      {!p.canEdit && p.readOnlyReason ? <ReadOnlyNote reason={p.readOnlyReason} /> : null}
      {!live ? (
        <Alert>
          <BanIcon />
          <AlertTitle>Void</AlertTitle>
          <AlertDescription>{p.voidReason}. The invoices it paid owe again.</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["Received", p.amountPaise],
          ["Applied to invoices", p.allocatedPaise],
          ["Advance left", p.unallocatedPaise],
        ].map(([label, v]) => (
          <div key={label as string} className="rounded-xl border p-4">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{formatPaise(v as number)}</p>
          </div>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Invoices settled</CardTitle>
        </CardHeader>
        <CardContent>
          {p.allocations.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Applied</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {p.allocations.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <Link href={`/billing/invoices/${a.invoiceId}`} className="font-mono text-xs hover:underline">{a.invoiceNumber}</Link>
                    </TableCell>
                    <TableCell>{fmtDate(a.invoiceDate)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatPaise(a.amountPaise)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">Not applied to any invoice: the whole amount is an advance.</p>
          )}
        </CardContent>
      </Card>

      {p.refunds.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Refunds</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-1 text-sm">
              {p.refunds.map((r) => (
                <li key={r.id} className="flex flex-wrap gap-2">
                  <span className="font-mono">{r.number}</span> {fmtDate(r.refundDate)} · {methodLabel(r.method)} · <span className="tabular-nums">{formatPaise(r.amountPaise)}</span>
                  {r.status === "void" ? <Badge variant="outline">Void</Badge> : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {p.reference || p.notes ? (
        <Card>
          <CardContent className="flex flex-col gap-1 text-sm">
            {p.reference ? <p><span className="text-muted-foreground">Reference: </span><span className="font-mono">{p.reference}</span></p> : null}
            {p.notes ? <p className="whitespace-pre-line">{p.notes}</p> : null}
          </CardContent>
        </Card>
      ) : null}

      {dialog === "apply" ? <ApplyAdvanceDialog payment={p} onClose={() => setDialog(null)} onDone={q.reload} /> : null}
      {dialog === "refund" ? <RefundDialog customerId={p.customerId} source={{ paymentId: p.id, label: `advance on ${p.number}`, maxPaise: p.unallocatedPaise }} onClose={() => setDialog(null)} onDone={q.reload} /> : null}
      {dialog === "void" ? (
        <VoidDialog
          title={`Void receipt ${p.number}?`}
          description="The invoices it paid will owe again. The receipt number stays used. This can't be undone."
          path={`${BASE}/payments/${p.id}/void`}
          placeholder="e.g. Cheque bounced"
          onClose={() => setDialog(null)}
          onDone={q.reload}
        />
      ) : null}
    </div>
  );
}

function ApplyAdvanceDialog({ payment, onClose, onDone }: { payment: PaymentDetail; onClose: () => void; onDone: () => void }) {
  const open = useApiQuery<OpenItems>(`${BASE}/payments/open-items?customerId=${payment.customerId}`);
  const invoices = (open.data?.invoices ?? []).filter((i) => !payment.allocations.some((a) => a.invoiceId === i.id));
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      setError(null);
      try {
        const allocations = invoices.filter((i) => amounts[i.id]).map((i) => ({ invoiceId: i.id, amount: amounts[i.id] }));
        await api(`${BASE}/payments/${payment.id}/allocate`, { method: "POST", json: { allocations } });
        onDone();
        onClose();
      } catch (e) {
        setError(saveError(e, setErrors));
      }
    });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Apply advance</DialogTitle>
          <DialogDescription>{formatPaise(payment.unallocatedPaise)} of this payment isn&apos;t applied yet.</DialogDescription>
        </DialogHeader>
        {open.status === "loading" ? (
          <Skeleton className="h-24 rounded-xl" />
        ) : (
          <>
            <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setAmounts(autoApply(invoices, payment.unallocatedPaise))} disabled={!invoices.length}>
              Apply oldest first
            </Button>
            <AllocationTable invoices={invoices} amounts={amounts} onAmount={(id, v) => setAmounts((a) => ({ ...a, [id]: v }))} errors={errors} />
          </>
        )}
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button onClick={save} disabled={pending || !Object.values(amounts).some(Boolean)}>
            {pending ? <Spinner data-icon="inline-start" /> : null}
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VoidDialog({ title, description, path, placeholder, onClose, onDone }: { title: string; description: string; path: string; placeholder: string; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <AlertDialog open onOpenChange={(o: boolean) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <TextField id="void-reason" label="Reason" value={reason} onValue={setReason} placeholder={placeholder} maxLength={300} />
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending || !reason.trim()}
            onClick={() =>
              start(async () => {
                try {
                  await api(path, { method: "POST", json: { reason } });
                  onDone();
                  onClose();
                } catch (e) {
                  setError(e instanceof ApiError ? e.message : "Something went wrong. Try again.");
                }
              })
            }
          >
            {pending ? <Spinner data-icon="inline-start" /> : null}
            Void
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/* ---------------- Refunds ---------------- */

type RefundSource = { paymentId?: string; creditNoteId?: string; label: string; maxPaise: number };

export function RefundDialog({ customerId, source, onClose, onDone }: { customerId: string; source: RefundSource; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ refundDate: todayInIndia(), amount: paiseToRupees(source.maxPaise), method: "bank_transfer", reference: "", notes: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [key] = useState(newKey);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const save = () => {
    const p = { customerId, paymentId: source.paymentId ?? null, creditNoteId: source.creditNoteId ?? null, ...form };
    const local = validateRefund(p);
    if (!local.ok) return setErrors(local.errors);
    start(async () => {
      setError(null);
      try {
        await postOnce(`${BASE}/refunds`, key, p);
        onDone();
        onClose();
      } catch (e) {
        setError(saveError(e, setErrors));
      }
    });
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Refund {source.label}</DialogTitle>
          <DialogDescription>Up to {formatPaise(source.maxPaise)} can be refunded.</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <div className="grid gap-4 sm:grid-cols-2">
            <MoneyField id="rf-amount" label="Amount" value={form.amount} onValue={(v) => set("amount", v)} error={errors.amount} />
            <TextField id="rf-date" label="Date" type="date" value={form.refundDate} onValue={(v) => set("refundDate", v)} error={errors.refundDate} />
          </div>
          <SelectField id="rf-method" label="Paid back by" value={form.method} onValue={(v) => set("method", v || "bank_transfer")} options={PAYMENT_METHOD_OPTIONS} />
          <TextField id="rf-ref" label="Reference" optional={!(form.method === "cheque" || form.method === "bank_transfer")} value={form.reference} onValue={(v) => set("reference", v)} error={errors.reference} />
        </FieldGroup>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button onClick={save} disabled={pending}>
            {pending ? <Spinner data-icon="inline-start" /> : null}
            Record refund
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type RefundRow = { id: string; number: string | null; status: string; refundDate: string; amountPaise: number; method: string; customerName: string; paymentId: string | null; paymentNumber: string | null; creditNoteId: string | null; creditNoteNumber: string | null; voidReason: string | null };

export function RefundsList() {
  const list = useRecordList<RefundRow & Record<string, unknown>>(`${BASE}/refunds`);
  const { query } = list;
  const [voiding, setVoiding] = useState<RefundRow | null>(null);
  const canEdit = query.data?.canEdit ?? false;
  return (
    <div className="flex flex-col gap-4">
      <PaymentsNav />
      <ListToolbar search={list.search} onSearch={list.setSearch} placeholder="Search refund, reference or customer" status={list.status} onStatus={list.setStatus} />
      <p className="text-sm text-muted-foreground">Refund an unused advance from its payment receipt, or an over-credited invoice from its credit note.</p>
      {query.status === "loading" ? (
        <ListSkeleton />
      ) : !query.data ? (
        <LoadError message={query.error.message} onRetry={query.reload} />
      ) : query.data.items.length === 0 ? (
        <EmptyList Icon={Undo2Icon} title="No refunds" description="Money you pay back to customers shows here." filtered={list.filtered} />
      ) : (
        <>
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Refund</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="hidden sm:table-cell">From</TableHead>
                  <TableHead className="hidden md:table-cell">Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  {canEdit ? <TableHead><span className="sr-only">Actions</span></TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.items.map((r) => (
                  <TableRow key={r.id} className={r.status === "void" ? "text-muted-foreground" : undefined}>
                    <TableCell className="font-mono text-xs">
                      {r.number}
                      {r.status === "void" ? <Badge variant="outline" className="ml-2">Void</Badge> : null}
                    </TableCell>
                    <TableCell className="max-w-48 truncate">{r.customerName}</TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {r.paymentId ? (
                        <Link href={`/billing/payments/${r.paymentId}`} className="font-mono text-xs hover:underline">{r.paymentNumber}</Link>
                      ) : (
                        <Link href={`/billing/credit-notes/${r.creditNoteId}`} className="font-mono text-xs hover:underline">{r.creditNoteNumber}</Link>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{fmtDate(r.refundDate)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatPaise(r.amountPaise)}</TableCell>
                    {canEdit ? (
                      <TableCell className="text-right">
                        {r.status === "recorded" ? (
                          <Button variant="ghost" size="sm" onClick={() => setVoiding(r)}>Void</Button>
                        ) : null}
                      </TableCell>
                    ) : null}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pager page={list.page} pageSize={query.data.pageSize} total={query.data.total} onPage={list.setPage} />
        </>
      )}
      {voiding ? (
        <VoidDialog title={`Void refund ${voiding.number}?`} description="The money counts as unrefunded again." path={`${BASE}/refunds/${voiding.id}/void`} placeholder="e.g. Transfer failed" onClose={() => setVoiding(null)} onDone={query.reload} />
      ) : null}
    </div>
  );
}

/* ---------------- Outstanding ---------------- */

type Ageing = { current: number; d1_30: number; d31_60: number; d61_90: number; d90_plus: number };
type Outstanding = {
  today: string;
  totals: { invoices: number; totalPaise: number; overduePaise: number; ageing: Ageing };
  customers: { customerId: string; customerName: string; invoices: number; totalPaise: number; overduePaise: number; ageing: Ageing; oldestDue: string | null }[];
};
const BUCKETS: [keyof Ageing, string][] = [
  ["current", "Not due"],
  ["d1_30", "1–30 days"],
  ["d31_60", "31–60"],
  ["d61_90", "61–90"],
  ["d90_plus", "90+"],
];

export function OutstandingView() {
  const q = useApiQuery<Outstanding>(`${BASE}/outstanding`);
  return (
    <div className="flex flex-col gap-4">
      <PaymentsNav />
      {q.status === "loading" ? (
        <ListSkeleton />
      ) : !q.data ? (
        <LoadError message={q.error.message} onRetry={q.reload} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border p-4">
              <p className="text-sm text-muted-foreground">To collect</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{formatPaise(q.data.totals.totalPaise)}</p>
              <p className="text-xs text-muted-foreground">{q.data.totals.invoices} unpaid invoice{q.data.totals.invoices === 1 ? "" : "s"}</p>
            </div>
            <div className="rounded-xl border p-4">
              <p className="text-sm text-muted-foreground">Overdue</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-destructive">{formatPaise(q.data.totals.overduePaise)}</p>
            </div>
            <div className="rounded-xl border p-4">
              <p className="text-sm text-muted-foreground">90+ days late</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{formatPaise(q.data.totals.ageing.d90_plus)}</p>
            </div>
          </div>
          {q.data.customers.length === 0 ? (
            <EmptyList Icon={WalletIcon} title="Nothing outstanding" description="Every issued invoice is paid." filtered={false} />
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer</TableHead>
                    {BUCKETS.map(([k, label]) => (
                      <TableHead key={k} className={`text-right ${k === "current" ? "" : "hidden md:table-cell"}`}>{label}</TableHead>
                    ))}
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {q.data.customers.map((c) => (
                    <TableRow key={c.customerId}>
                      <TableCell>
                        <Link href={`/billing/customers/${c.customerId}`} className="font-medium hover:underline">{c.customerName}</Link>
                        <span className="block text-xs text-muted-foreground">{c.invoices} invoice{c.invoices === 1 ? "" : "s"}</span>
                      </TableCell>
                      {BUCKETS.map(([k]) => (
                        <TableCell key={k} className={`text-right tabular-nums ${k === "current" ? "" : "hidden md:table-cell"} ${k !== "current" && c.ageing[k] ? "text-destructive" : ""}`}>
                          {c.ageing[k] ? formatPaise(c.ageing[k]) : "—"}
                        </TableCell>
                      ))}
                      <TableCell className="text-right font-medium tabular-nums">{formatPaise(c.totalPaise)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell>Total</TableCell>
                    {BUCKETS.map(([k]) => (
                      <TableCell key={k} className={`text-right tabular-nums ${k === "current" ? "" : "hidden md:table-cell"}`}>{formatPaise(q.data!.totals.ageing[k])}</TableCell>
                    ))}
                    <TableCell className="text-right tabular-nums">{formatPaise(q.data.totals.totalPaise)}</TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}
          <p className="text-xs text-muted-foreground">Ageing counts days past each invoice&apos;s due date (or its date, if it has none), as of {fmtDate(q.data.today)}.</p>
        </>
      )}
    </div>
  );
}

/* ---------------- Customer account (on the customer page) ---------------- */

type Account = {
  outstandingPaise: number;
  unallocatedAdvancePaise: number;
  invoicedPaise: number;
  receivedPaise: number;
  openInvoices: OpenInvoice[];
  ledger: { date: string; kind: string; id: string | null; number: string | null; debitPaise: number; creditPaise: number; balancePaise: number }[];
};
const KIND: Record<string, [string, string | null]> = {
  opening: ["Opening balance", null],
  invoice: ["Invoice", "invoices"],
  debit_note: ["Debit note", "debit-notes"],
  credit_note: ["Credit note", "credit-notes"],
  payment: ["Payment", "payments"],
  refund: ["Refund", null],
};

export function CustomerAccount({ customerId, canRecord }: { customerId: string; canRecord: boolean }) {
  const q = useApiQuery<Account>(`${BASE}/customers/${customerId}/account`);
  if (q.status === "loading") return <Skeleton className="h-48 rounded-xl" />;
  if (!q.data) return <LoadError message={q.error.message} onRetry={q.reload} />;
  const a = q.data;
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <CardTitle>Account</CardTitle>
          <CardDescription>
            {a.outstandingPaise > 0 ? `Owes you ${formatPaise(a.outstandingPaise)}.` : a.outstandingPaise < 0 ? `You hold ${formatPaise(-a.outstandingPaise)} of their money (advance or credit).` : "Fully settled."}
            {a.unallocatedAdvancePaise > 0 ? ` ${formatPaise(a.unallocatedAdvancePaise)} advance not yet applied.` : ""}
          </CardDescription>
        </div>
        {canRecord ? (
          <Button size="sm" render={<Link href={`/billing/payments/create?customerId=${customerId}`} />} nativeButton={false}>
            <WalletIcon data-icon="inline-start" />
            Record payment
          </Button>
        ) : null}
      </CardHeader>
      <CardContent>
        {a.ledger.length === 0 ? (
          <p className="text-sm text-muted-foreground">No invoices or payments yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Entry</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {a.ledger.map((e, i) => {
                  const [label, slug] = KIND[e.kind] ?? [e.kind, null];
                  return (
                    <TableRow key={`${e.kind}-${e.id ?? i}`}>
                      <TableCell className="whitespace-nowrap">{fmtDate(e.date)}</TableCell>
                      <TableCell>
                        {label}{" "}
                        {e.id && slug ? (
                          <Link href={`/billing/${slug}/${e.id}`} className="font-mono text-xs hover:underline">{e.number}</Link>
                        ) : (
                          <span className="font-mono text-xs">{e.number}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{e.debitPaise ? formatPaise(e.debitPaise) : ""}</TableCell>
                      <TableCell className="text-right tabular-nums">{e.creditPaise ? formatPaise(e.creditPaise) : ""}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{formatPaise(e.balancePaise)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------- Invoice payment panel (on the invoice page) ---------------- */

export type InvoicePayment = {
  paidPaise: number;
  creditedPaise: number;
  debitedPaise: number;
  creditRefundedPaise: number;
  balancePaise: number;
  payments: { paymentId: string; number: string | null; paymentDate: string; method: string; status: string; amountPaise: number }[];
};

export function InvoicePaymentPanel({ invoiceId, customerId, status, payment, canRecord, creditNotes, onChanged }: { invoiceId: string; customerId: string; status: string; payment: InvoicePayment; canRecord: boolean; creditNotes: { id: string; number: string | null }[]; onChanged: () => void }) {
  const [refundFor, setRefundFor] = useState<{ id: string; number: string | null; max: number } | null>(null);
  const open = useApiQuery<OpenItems>(`${BASE}/payments/open-items?customerId=${customerId}`);
  if (status === "draft" || status === "void") return null;
  const refundable = (open.data?.creditNotes ?? []).filter((c) => creditNotes.some((n) => n.id === c.id));
  return (
    <Card size="sm">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <CardTitle>Payment</CardTitle>
          <CardDescription>
            {payment.balancePaise > 0 ? `${formatPaise(payment.balancePaise)} still due.` : payment.balancePaise < 0 ? `Over-credited by ${formatPaise(-payment.balancePaise)}.` : "Fully paid."}
          </CardDescription>
        </div>
        {canRecord && payment.balancePaise > 0 ? (
          <Button size="sm" render={<Link href={`/billing/payments/create?customerId=${customerId}&invoiceId=${invoiceId}`} />} nativeButton={false}>
            <WalletIcon data-icon="inline-start" />
            Record payment
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <dl className="grid max-w-sm grid-cols-2 gap-1">
          {payment.debitedPaise ? (<><dt className="text-muted-foreground">Debit notes</dt><dd className="text-right tabular-nums">+{formatPaise(payment.debitedPaise)}</dd></>) : null}
          {payment.creditedPaise ? (<><dt className="text-muted-foreground">Credit notes</dt><dd className="text-right tabular-nums">−{formatPaise(payment.creditedPaise)}</dd></>) : null}
          <dt className="text-muted-foreground">Paid</dt>
          <dd className="text-right tabular-nums">{formatPaise(payment.paidPaise)}</dd>
          {payment.creditRefundedPaise ? (<><dt className="text-muted-foreground">Refunded</dt><dd className="text-right tabular-nums">{formatPaise(payment.creditRefundedPaise)}</dd></>) : null}
          <dt className="font-medium">Balance due</dt>
          <dd className="text-right font-medium tabular-nums">{formatPaise(payment.balancePaise)}</dd>
        </dl>
        {payment.payments.length ? (
          <ul className="flex flex-col gap-1">
            {payment.payments.map((p) => (
              <li key={p.paymentId} className="flex flex-wrap items-center gap-2">
                <Link href={`/billing/payments/${p.paymentId}`} className="font-mono text-xs hover:underline">{p.number}</Link>
                <span>{fmtDate(p.paymentDate)} · {methodLabel(p.method)} · <span className="tabular-nums">{formatPaise(p.amountPaise)}</span></span>
                {p.status === "void" ? <StatusBadge status="void" /> : null}
              </li>
            ))}
          </ul>
        ) : null}
        {canRecord && refundable.length ? (
          <div className="flex flex-wrap gap-2">
            {refundable.map((c) => (
              <Button key={c.id} size="sm" variant="outline" onClick={() => setRefundFor({ id: c.id, number: c.number, max: c.refundablePaise })}>
                <Undo2Icon data-icon="inline-start" />
                Refund {formatPaise(c.refundablePaise)} on {c.number}
              </Button>
            ))}
          </div>
        ) : null}
      </CardContent>
      {refundFor ? (
        <RefundDialog
          customerId={customerId}
          source={{ creditNoteId: refundFor.id, label: `credit note ${refundFor.number}`, maxPaise: refundFor.max }}
          onClose={() => setRefundFor(null)}
          onDone={() => {
            open.reload();
            onChanged();
          }}
        />
      ) : null}
    </Card>
  );
}

/* ---------------- Printable receipt ---------------- */

export function ReceiptPrint({ id }: { id: string }) {
  const q = useApiQuery<PaymentDetail>(`${BASE}/payments/${id}`);
  const ctx = useDocumentContext();
  if (q.status === "loading" || !ctx.ready) return <p className="p-8 text-sm text-neutral-500">Loading…</p>;
  if (!q.data) return <div className="p-8"><LoadError message={q.error.message} onRetry={q.reload} /></div>;
  const p = q.data;
  const seller = ctx.company;
  return (
    <div className="min-h-dvh bg-neutral-100 py-6 print:bg-white print:py-0">
      <div className="mx-auto mb-4 flex max-w-[210mm] justify-end px-4 print:hidden">
        <Button onClick={() => window.print()}>
          <PrinterIcon data-icon="inline-start" />
          Print or save as PDF
        </Button>
      </div>
      <article className="relative mx-auto w-full max-w-[210mm] bg-white p-8 text-[13px] text-neutral-900 shadow-sm ring-1 ring-neutral-200 sm:p-10 print:shadow-none print:ring-0">
        {p.status === "void" ? (
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="-rotate-30 text-8xl font-bold tracking-widest text-neutral-200 uppercase">void</span>
          </div>
        ) : null}
        <header className="relative flex flex-col gap-4 border-b border-neutral-300 pb-5 sm:flex-row sm:justify-between">
          <div className="flex items-start gap-4">
            {ctx.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={ctx.logoUrl} alt="" className="h-14 w-auto max-w-36 object-contain" />
            ) : null}
            <div>
              <p className="text-lg font-semibold">{seller?.tradeName || seller?.legalName}</p>
              {seller?.gstin ? <p>GSTIN: <span className="font-mono">{seller.gstin}</span></p> : null}
            </div>
          </div>
          <div className="sm:text-right">
            <p className="text-xl font-bold uppercase">Payment receipt</p>
            <p className="font-mono">{p.number}</p>
            <p>{fmtDate(p.paymentDate)}</p>
          </div>
        </header>
        <section className="relative flex flex-col gap-2 py-6">
          <p>
            Received with thanks from <span className="font-semibold">{p.customerName}</span> the sum of{" "}
            <span className="font-semibold">{formatPaise(p.amountPaise)}</span> ({amountInWords(p.amountPaise)}) by {methodLabel(p.method)}
            {p.reference ? <> (ref. <span className="font-mono">{p.reference}</span>)</> : null}.
          </p>
        </section>
        {p.allocations.length ? (
          <table className="relative w-full border-collapse">
            <thead>
              <tr className="border-b border-neutral-300 text-left text-xs text-neutral-600 uppercase">
                <th className="py-2">Against invoice</th>
                <th className="py-2">Invoice date</th>
                <th className="py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {p.allocations.map((a) => (
                <tr key={a.id} className="border-b border-neutral-200">
                  <td className="py-2 font-mono">{a.invoiceNumber}</td>
                  <td className="py-2">{fmtDate(a.invoiceDate)}</td>
                  <td className="py-2 text-right tabular-nums">{formatPaise(a.amountPaise)}</td>
                </tr>
              ))}
              {p.amountPaise - p.allocatedPaise > 0 ? (
                <tr className="border-b border-neutral-200">
                  <td className="py-2" colSpan={2}>Advance</td>
                  <td className="py-2 text-right tabular-nums">{formatPaise(p.amountPaise - p.allocatedPaise)}</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        ) : (
          <p className="relative">Received as an advance.</p>
        )}
        <footer className="relative mt-14 flex items-end justify-between">
          <p className="text-xs text-neutral-500">This is a computer-generated receipt.</p>
          <div className="text-right">
            <p className="font-medium">For {seller?.tradeName || seller?.legalName}</p>
            <div className="h-10" />
            <p className="border-t border-neutral-400 pt-1 text-xs text-neutral-600">Authorised signatory</p>
          </div>
        </footer>
      </article>
    </div>
  );
}
