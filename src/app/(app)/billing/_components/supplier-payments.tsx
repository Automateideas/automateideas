"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BanIcon, PlusIcon, TruckIcon, WalletIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { api, useApiQuery } from "@/lib/api";
import { todayInIndia } from "@/lib/business-billing/documents/types";
import { formatPaise, paiseToRupees } from "@/lib/business-billing/fields";
import { PAYMENT_METHOD_OPTIONS, methodLabel, validateSupplierPayment } from "@/lib/business-billing/payments/validation";

import { LoadError } from "../../_components/page-parts";
import { PurchasesNav, StatusBadge, fmtDate } from "./documents/documents-ui";
import { type Ageing, AllocationTable, BUCKETS, type OpenInvoice, VoidDialog, autoApply, newKey, postOnce, toPaise } from "./payments";
import { BackLink, EmptyList, type Errors, ListSkeleton, ListToolbar, MoneyField, Pager, ReadOnlyNote, SelectField, TextField, focusFirstError, saveError, useRecordList } from "./records-ui";

const BASE = "/api/business-billing";

type OpenBill = { id: string; number: string | null; supplierBillNumber: string | null; issueDate: string; dueDate: string | null; totalPaise: number; balancePaise: number };
/** Bills shown in the shared allocation table: our number plus the supplier's. */
const asRows = (bills: OpenBill[]): OpenInvoice[] => bills.map((b) => ({ ...b, number: b.supplierBillNumber ? `${b.number} (${b.supplierBillNumber})` : b.number }));
/** Server errors name bills "billId"; the table shows "invoiceId" slots. */
const tableErrors = (e: Errors): Errors => Object.fromEntries(Object.entries(e).map(([k, v]) => [k.replace(".billId", ".invoiceId"), v]));

/* ---------------- List ---------------- */

type Row = { id: string; number: string | null; status: string; paymentDate: string; amountPaise: number; method: string; supplierName: string; unallocatedPaise: number };

export function SupplierPaymentsList() {
  const list = useRecordList<Row>(`${BASE}/supplier-payments`);
  const { query } = list;
  const canEdit = query.data?.canEdit ?? false;
  const add = (
    <Button render={<Link href="/billing/supplier-payments/create" />} nativeButton={false}>
      <PlusIcon data-icon="inline-start" />
      Record payment
    </Button>
  );
  return (
    <div className="flex flex-col gap-4">
      <PurchasesNav />
      <ListToolbar search={list.search} onSearch={list.setSearch} placeholder="Search number, reference or supplier" status={list.status} onStatus={list.setStatus}>
        {canEdit ? add : null}
      </ListToolbar>
      {query.data && !canEdit ? <ReadOnlyNote reason={query.data.readOnlyReason} /> : null}
      {query.status === "loading" ? (
        <ListSkeleton />
      ) : !query.data ? (
        <LoadError message={query.error.message} onRetry={query.reload} />
      ) : query.data.items.length === 0 ? (
        <EmptyList Icon={WalletIcon} title="No supplier payments yet" description="Record money you pay suppliers and set it against their bills." filtered={list.filtered} action={canEdit ? add : undefined} />
      ) : (
        <>
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Payment</TableHead>
                  <TableHead>Supplier</TableHead>
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
                      <Link href={`/billing/supplier-payments/${p.id}`} className="font-mono text-xs font-medium text-foreground hover:underline">{p.number}</Link>
                      {p.status === "void" ? <Badge variant="outline" className="ml-2">Void</Badge> : null}
                    </TableCell>
                    <TableCell className="max-w-48 truncate">{p.supplierName}</TableCell>
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

/* ---------------- Record ---------------- */

type SupplierOption = { id: string; name: string; gstin: string | null };

function SupplierPicker({ value, onChange, error }: { value: SupplierOption | null; onChange: (s: SupplierOption | null) => void; error?: string }) {
  const suppliers = useApiQuery<{ items: SupplierOption[] }>(`${BASE}/suppliers?pageSize=200`);
  const resolved = value && !value.name ? (suppliers.data?.items.find((s) => s.id === value.id) ?? null) : value;
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor="sp-supplier">Supplier</FieldLabel>
      <Combobox
        items={suppliers.data?.items ?? []}
        value={resolved}
        onValueChange={(s: SupplierOption | null) => onChange(s)}
        itemToStringLabel={(s: SupplierOption) => s.name}
        isItemEqualToValue={(a: SupplierOption, b: SupplierOption) => a.id === b.id}
        autoHighlight
      >
        <ComboboxInput id="sp-supplier" placeholder="Search suppliers" className="w-full" aria-invalid={!!error} />
        <ComboboxContent>
          <ComboboxEmpty>No supplier matches.</ComboboxEmpty>
          <ComboboxList>
            {(s: SupplierOption) => (
              <ComboboxItem key={s.id} value={s}>
                {s.name}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <FieldError>{error}</FieldError>
    </Field>
  );
}

export function RecordSupplierPaymentForm({ supplierId: preset, billId: presetBill }: { supplierId?: string; billId?: string }) {
  const router = useRouter();
  const [supplier, setSupplier] = useState<SupplierOption | null>(preset ? { id: preset, name: "", gstin: null } : null);
  const [form, setForm] = useState({ paymentDate: todayInIndia(), amount: "", method: "bank_transfer", reference: "", notes: "" });
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [key] = useState(newKey);
  const open = useApiQuery<{ bills: OpenBill[] }>(supplier ? `${BASE}/supplier-payments/open-items?supplierId=${supplier.id}` : `${BASE}/supplier-payments/open-items`);
  const bills = supplier ? (open.data?.bills ?? []) : [];
  const [prefilled, setPrefilled] = useState(false);
  if (!prefilled && presetBill && bills.length) {
    const b = bills.find((x) => x.id === presetBill);
    setPrefilled(true);
    if (b) {
      setForm((f) => ({ ...f, amount: paiseToRupees(b.balancePaise) }));
      setAmounts({ [b.id]: paiseToRupees(b.balancePaise) });
    }
  }
  const amountPaise = toPaise(form.amount) ?? 0;
  const allocated = bills.reduce((a, b) => a + (toPaise(amounts[b.id] ?? "") ?? 0), 0);
  const advance = amountPaise - allocated;
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const shown = bills.filter((b) => amounts[b.id]);
    const payload = { supplierId: supplier?.id ?? "", ...form, allocations: shown.map((b) => ({ billId: b.id, amount: amounts[b.id] })) };
    const local = validateSupplierPayment(payload);
    const remap = (errs: Errors) =>
      Object.fromEntries(
        Object.entries(tableErrors(errs)).map(([k, v]) => {
          const m = /^allocations\.(\d+)\.(.+)$/.exec(k);
          return [m ? `allocations.${bills.indexOf(shown[Number(m[1])])}.${m[2]}` : k, v];
        }),
      );
    if (!local.ok) {
      setErrors(remap(local.errors));
      focusFirstError();
      return;
    }
    setErrors({});
    start(async () => {
      try {
        const saved = await postOnce<{ id: string }>(`${BASE}/supplier-payments`, key, payload);
        router.push(`/billing/supplier-payments/${saved.id}`);
      } catch (err) {
        setError(saveError(err, (x) => setErrors(remap(x as Errors))));
      }
    });
  }

  return (
    <form noValidate onSubmit={onSubmit} className="flex max-w-4xl flex-col gap-6">
      <PurchasesNav />
      <BackLink href="/billing/supplier-payments">Back to supplier payments</BackLink>
      <h2 className="text-lg font-semibold">Pay a supplier</h2>
      <Card>
        <CardHeader>
          <CardTitle>Payment</CardTitle>
          <CardDescription>Money you paid to a supplier.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-5 sm:grid-cols-2">
              <SupplierPicker value={supplier} onChange={(s) => { setSupplier(s); setAmounts({}); }} error={errors.supplierId} />
              <TextField id="sp-date" label="Date paid" type="date" value={form.paymentDate} onValue={(v) => set("paymentDate", v)} error={errors.paymentDate} />
              <MoneyField id="sp-amount" label="Amount paid" value={form.amount} onValue={(v) => set("amount", v)} error={errors.amount} />
              <SelectField id="sp-method" label="Method" value={form.method} onValue={(v) => set("method", v || "bank_transfer")} options={PAYMENT_METHOD_OPTIONS} error={errors.method} />
              <TextField id="sp-ref" label={form.method === "cheque" ? "Cheque number" : "UTR / reference"} optional={!(form.method === "cheque" || form.method === "bank_transfer")} value={form.reference} onValue={(v) => set("reference", v)} error={errors.reference} />
            </div>
            <Field>
              <FieldLabel htmlFor="sp-notes">Notes <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel>
              <Textarea id="sp-notes" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>
      {supplier ? (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <CardTitle>Pay bills</CardTitle>
              <CardDescription>Anything not set against a bill stays as an advance with the supplier.</CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setAmounts(autoApply(asRows(bills), amountPaise))} disabled={!amountPaise || !bills.length}>
              Apply oldest first
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {open.status === "loading" ? <Skeleton className="h-24 rounded-xl" /> : <AllocationTable label="Bill" invoices={asRows(bills)} amounts={amounts} onAmount={(id, v) => setAmounts((a) => ({ ...a, [id]: v }))} errors={errors} />}
            {errors.allocations ? <p role="alert" className="text-sm text-destructive">{errors.allocations}</p> : null}
            <dl className="ml-auto grid w-full max-w-xs grid-cols-2 gap-1 text-sm">
              <dt className="text-muted-foreground">Set against bills</dt>
              <dd className="text-right tabular-nums">{formatPaise(allocated)}</dd>
              <dt className={advance < 0 ? "text-destructive" : "text-muted-foreground"}>{advance < 0 ? "Over-applied" : "Advance to supplier"}</dt>
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
        <Button variant="ghost" render={<Link href="/billing/supplier-payments" />} nativeButton={false}>Cancel</Button>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      </div>
    </form>
  );
}

/* ---------------- View ---------------- */

type Detail = {
  id: string;
  number: string | null;
  status: string;
  supplierId: string;
  supplierName: string;
  paymentDate: string;
  amountPaise: number;
  method: string;
  reference: string | null;
  notes: string | null;
  voidReason: string | null;
  allocations: { id: string; billId: string | null; amountPaise: number; billNumber: string | null; supplierBillNumber: string | null; billDate: string }[];
  allocatedPaise: number;
  unallocatedPaise: number;
  canEdit: boolean;
  readOnlyReason: string | null;
};

export function SupplierPaymentView({ id }: { id: string }) {
  const q = useApiQuery<Detail>(`${BASE}/supplier-payments/${id}`);
  const [dialog, setDialog] = useState<"apply" | "void" | null>(null);
  if (q.status === "loading") return <Skeleton className="h-96 max-w-4xl rounded-xl" aria-label="Loading" />;
  if (!q.data) return <LoadError message={q.error.message} onRetry={q.reload} />;
  const p = q.data;
  const live = p.status === "recorded";
  return (
    <div className="flex max-w-4xl flex-col gap-5">
      <PurchasesNav />
      <BackLink href="/billing/supplier-payments">Back to supplier payments</BackLink>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
            Payment <span className="font-mono">{p.number}</span>
            {live ? <Badge>Recorded</Badge> : <Badge variant="outline">Void</Badge>}
          </h2>
          <p className="text-sm text-muted-foreground">
            <Link href={`/billing/suppliers/${p.supplierId}`} className="hover:underline">{p.supplierName}</Link> · {formatPaise(p.amountPaise)} · {methodLabel(p.method)} · {fmtDate(p.paymentDate)}
            {p.reference ? <> · ref. <span className="font-mono">{p.reference}</span></> : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {p.canEdit && live && p.unallocatedPaise > 0 ? <Button onClick={() => setDialog("apply")}>Set advance against bills</Button> : null}
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
          <AlertDescription>{p.voidReason}. The bills it paid are owed again.</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["Paid", p.amountPaise],
          ["Set against bills", p.allocatedPaise],
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
          <CardTitle>Bills paid</CardTitle>
        </CardHeader>
        <CardContent>
          {p.allocations.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Bill</TableHead>
                  <TableHead>Supplier&apos;s no.</TableHead>
                  <TableHead className="hidden sm:table-cell">Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {p.allocations.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <Link href={`/billing/purchase-bills/${a.billId}`} className="font-mono text-xs hover:underline">{a.billNumber}</Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{a.supplierBillNumber}</TableCell>
                    <TableCell className="hidden sm:table-cell">{fmtDate(a.billDate)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatPaise(a.amountPaise)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">Not set against any bill: the whole amount is an advance with the supplier.</p>
          )}
        </CardContent>
      </Card>
      {dialog === "apply" ? <ApplyDialog payment={p} onClose={() => setDialog(null)} onDone={q.reload} /> : null}
      {dialog === "void" ? (
        <VoidDialog title={`Void payment ${p.number}?`} description="The bills it paid will be owed again. The number stays used. This can't be undone." path={`${BASE}/supplier-payments/${p.id}/void`} placeholder="e.g. Transfer bounced" onClose={() => setDialog(null)} onDone={q.reload} />
      ) : null}
    </div>
  );
}

function ApplyDialog({ payment, onClose, onDone }: { payment: Detail; onClose: () => void; onDone: () => void }) {
  const open = useApiQuery<{ bills: OpenBill[] }>(`${BASE}/supplier-payments/open-items?supplierId=${payment.supplierId}`);
  const bills = (open.data?.bills ?? []).filter((b) => !payment.allocations.some((a) => a.billId === b.id));
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      setError(null);
      try {
        await api(`${BASE}/supplier-payments/${payment.id}/allocate`, { method: "POST", json: { allocations: bills.filter((b) => amounts[b.id]).map((b) => ({ billId: b.id, amount: amounts[b.id] })) } });
        onDone();
        onClose();
      } catch (e) {
        setError(saveError(e, (x) => setErrors(tableErrors(x as Errors))));
      }
    });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Set advance against bills</DialogTitle>
          <DialogDescription>{formatPaise(payment.unallocatedPaise)} of this payment isn&apos;t set against a bill yet.</DialogDescription>
        </DialogHeader>
        {open.status === "loading" ? (
          <Skeleton className="h-24 rounded-xl" />
        ) : (
          <>
            <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => setAmounts(autoApply(asRows(bills), payment.unallocatedPaise))} disabled={!bills.length}>
              Apply oldest first
            </Button>
            <AllocationTable label="Bill" invoices={asRows(bills)} amounts={amounts} onAmount={(id, v) => setAmounts((a) => ({ ...a, [id]: v }))} errors={errors} />
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

/* ---------------- On the bill page ---------------- */

type BillPayment = { paidPaise: number; creditedPaise: number; balancePaise: number; payments: { paymentId: string; number: string | null; paymentDate: string; method: string; status: string; amountPaise: number }[] };

export function BillPaymentPanel({ billId, supplierId, status, payment, canRecord }: { billId: string; supplierId: string; status: string; payment: BillPayment; canRecord: boolean }) {
  if (status === "draft" || status === "void") return null;
  return (
    <Card size="sm">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <CardTitle>Payment</CardTitle>
          <CardDescription>{payment.balancePaise > 0 ? `You still owe ${formatPaise(payment.balancePaise)}.` : "Fully paid."}</CardDescription>
        </div>
        {canRecord && payment.balancePaise > 0 ? (
          <Button size="sm" render={<Link href={`/billing/supplier-payments/create?supplierId=${supplierId}&billId=${billId}`} />} nativeButton={false}>
            <WalletIcon data-icon="inline-start" />
            Pay this bill
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <dl className="grid max-w-sm grid-cols-2 gap-1">
          {payment.creditedPaise ? (<><dt className="text-muted-foreground">Returns</dt><dd className="text-right tabular-nums">−{formatPaise(payment.creditedPaise)}</dd></>) : null}
          <dt className="text-muted-foreground">Paid</dt>
          <dd className="text-right tabular-nums">{formatPaise(payment.paidPaise)}</dd>
          <dt className="font-medium">Balance due</dt>
          <dd className="text-right font-medium tabular-nums">{formatPaise(payment.balancePaise)}</dd>
        </dl>
        {payment.payments.length ? (
          <ul className="flex flex-col gap-1">
            {payment.payments.map((p) => (
              <li key={p.paymentId} className="flex flex-wrap items-center gap-2">
                <Link href={`/billing/supplier-payments/${p.paymentId}`} className="font-mono text-xs hover:underline">{p.number}</Link>
                <span>{fmtDate(p.paymentDate)} · {methodLabel(p.method)} · <span className="tabular-nums">{formatPaise(p.amountPaise)}</span></span>
                {p.status === "void" ? <StatusBadge status="void" /> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}

/* ---------------- Payables ---------------- */

type Payables = {
  today: string;
  totals: { bills: number; totalPaise: number; overduePaise: number; ageing: Ageing };
  suppliers: { supplierId: string; supplierName: string; bills: number; totalPaise: number; overduePaise: number; ageing: Ageing }[];
};

export function PayablesView() {
  const q = useApiQuery<Payables>(`${BASE}/payables`);
  return (
    <div className="flex flex-col gap-4">
      <PurchasesNav />
      {q.status === "loading" ? (
        <ListSkeleton />
      ) : !q.data ? (
        <LoadError message={q.error.message} onRetry={q.reload} />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border p-4">
              <p className="text-sm text-muted-foreground">You owe suppliers</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{formatPaise(q.data.totals.totalPaise)}</p>
              <p className="text-xs text-muted-foreground">{q.data.totals.bills} unpaid bill{q.data.totals.bills === 1 ? "" : "s"}</p>
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
          {q.data.suppliers.length === 0 ? (
            <EmptyList Icon={TruckIcon} title="Nothing to pay" description="Every recorded bill is paid." filtered={false} />
          ) : (
            <div className="overflow-x-auto rounded-xl border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Supplier</TableHead>
                    {BUCKETS.map(([k, label]) => (
                      <TableHead key={k} className={`text-right ${k === "current" ? "" : "hidden md:table-cell"}`}>{label}</TableHead>
                    ))}
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {q.data.suppliers.map((s) => (
                    <TableRow key={s.supplierId}>
                      <TableCell>
                        <Link href={`/billing/suppliers/${s.supplierId}`} className="font-medium hover:underline">{s.supplierName}</Link>
                        <span className="block text-xs text-muted-foreground">{s.bills} bill{s.bills === 1 ? "" : "s"}</span>
                      </TableCell>
                      {BUCKETS.map(([k]) => (
                        <TableCell key={k} className={`text-right tabular-nums ${k === "current" ? "" : "hidden md:table-cell"} ${k !== "current" && s.ageing[k] ? "text-destructive" : ""}`}>
                          {s.ageing[k] ? formatPaise(s.ageing[k]) : "—"}
                        </TableCell>
                      ))}
                      <TableCell className="text-right font-medium tabular-nums">{formatPaise(s.totalPaise)}</TableCell>
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
          <p className="text-xs text-muted-foreground">Ageing counts days past each bill&apos;s due date (or its date, if it has none), as of {fmtDate(q.data.today)}.</p>
        </>
      )}
    </div>
  );
}

/* ---------------- On the supplier page ---------------- */

type Account = {
  outstandingPaise: number;
  unallocatedAdvancePaise: number;
  ledger: { date: string; kind: string; id: string | null; number: string | null; debitPaise: number; creditPaise: number; balancePaise: number }[];
};
const KIND: Record<string, [string, string | null]> = {
  opening: ["Opening balance", null],
  bill: ["Bill", "purchase-bills"],
  purchase_return: ["Purchase return", "purchase-returns"],
  supplier_payment: ["Payment", "supplier-payments"],
};

export function SupplierAccount({ supplierId, canRecord }: { supplierId: string; canRecord: boolean }) {
  const q = useApiQuery<Account>(`${BASE}/suppliers/${supplierId}/account`);
  if (q.status === "loading") return <Skeleton className="h-48 rounded-xl" />;
  if (!q.data) return <LoadError message={q.error.message} onRetry={q.reload} />;
  const a = q.data;
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <CardTitle>Account</CardTitle>
          <CardDescription>
            {a.outstandingPaise > 0 ? `You owe ${formatPaise(a.outstandingPaise)}.` : a.outstandingPaise < 0 ? `They hold ${formatPaise(-a.outstandingPaise)} of your money (advance).` : "Fully settled."}
            {a.unallocatedAdvancePaise > 0 ? ` ${formatPaise(a.unallocatedAdvancePaise)} advance not yet set against bills.` : ""}
          </CardDescription>
        </div>
        {canRecord ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" render={<Link href="/billing/purchase-bills/create" />} nativeButton={false}>Record bill</Button>
            <Button size="sm" render={<Link href={`/billing/supplier-payments/create?supplierId=${supplierId}`} />} nativeButton={false}>
              <WalletIcon data-icon="inline-start" />
              Pay supplier
            </Button>
          </div>
        ) : null}
      </CardHeader>
      <CardContent>
        {a.ledger.length === 0 ? (
          <p className="text-sm text-muted-foreground">No bills or payments yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Entry</TableHead>
                  <TableHead className="text-right">Paid / returned</TableHead>
                  <TableHead className="text-right">Billed</TableHead>
                  <TableHead className="text-right">You owe</TableHead>
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
                        {e.id && slug ? <Link href={`/billing/${slug}/${e.id}`} className="font-mono text-xs hover:underline">{e.number}</Link> : <span className="font-mono text-xs">{e.number}</span>}
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
