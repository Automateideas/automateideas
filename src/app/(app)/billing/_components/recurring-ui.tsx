"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarSyncIcon, PauseIcon, PencilIcon, PlayIcon, RepeatIcon, SquareIcon, ZapIcon } from "lucide-react";

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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError, api, useApiQuery } from "@/lib/api";
import { todayInIndia } from "@/lib/business-billing/documents/types";
import { formatPaise } from "@/lib/business-billing/fields";
import { FREQUENCIES, FREQUENCY_LABELS, type Frequency, addDays, describeSchedule, validateSchedule } from "@/lib/business-billing/recurring/schedule";

import { LoadError } from "../../_components/page-parts";
import { SalesNav, StatusBadge, fmtDate } from "./documents/documents-ui";
import { BackLink, EmptyList, type Errors, ListSkeleton, ListToolbar, Pager, ReadOnlyNote, SelectField, TextField, focusFirstError, saveError, useRecordList } from "./records-ui";

const BASE = "/api/business-billing/recurring-invoices";
type State = "active" | "paused" | "ended";
const STATE: Record<State, { label: string; variant: "outline" | "secondary" }> = {
  active: { label: "Active", variant: "outline" },
  paused: { label: "Paused", variant: "secondary" },
  ended: { label: "Ended", variant: "secondary" },
};
const StateBadge = ({ status }: { status: State }) => <Badge variant={STATE[status].variant}>{STATE[status].label}</Badge>;

/* ---------------- Schedule form (create and edit) ---------------- */

type ScheduleForm = { name: string; frequency: Frequency; interval: string; startDate: string; endDate: string; maxCount: string; dueDays: string; autoIssue: boolean; autoEmail: boolean };

function ScheduleFields({ form, set, errors, startLocked }: { form: ScheduleForm; set: <K extends keyof ScheduleForm>(k: K, v: ScheduleForm[K]) => void; errors: Errors; startLocked?: boolean }) {
  const interval = Number(form.interval) || 1;
  const preview = form.startDate && /^\d{4}-\d{2}-\d{2}$/.test(form.startDate) ? describeSchedule(form.frequency, interval, form.startDate) : null;
  return (
    <FieldGroup>
      <TextField id="rc-name" label="Name" value={form.name} onValue={(v) => set("name", v)} error={errors.name} placeholder="e.g. Monthly maintenance" />
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField id="rc-frequency" label="Repeat" value={form.frequency} onValue={(v) => set("frequency", (v || "monthly") as Frequency)} options={FREQUENCIES.map((f) => ({ value: f, label: FREQUENCY_LABELS[f] }))} error={errors.frequency} />
        <TextField id="rc-interval" label={`Every … ${form.frequency === "weekly" ? "weeks" : form.frequency === "monthly" ? "months" : form.frequency === "quarterly" ? "quarters" : "years"}`} inputMode="numeric" value={form.interval} onValue={(v) => set("interval", v.replace(/\D/g, ""))} error={errors.interval} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField id="rc-start" label="First invoice on" type="date" min={startLocked ? undefined : todayInIndia()} value={form.startDate} onValue={(v) => set("startDate", v)} error={errors.startDate} disabled={startLocked} hint={startLocked ? "Fixed once invoices have been created." : undefined} />
        <TextField id="rc-due" label="Due after (days)" optional inputMode="numeric" value={form.dueDays} onValue={(v) => set("dueDays", v.replace(/\D/g, ""))} error={errors.dueDays} hint="Blank: the customer's payment terms." />
      </div>
      {preview ? <p className="text-sm text-muted-foreground">{preview}.</p> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField id="rc-end" label="Stop after this date" optional type="date" value={form.endDate} onValue={(v) => set("endDate", v)} error={errors.endDate} />
        <TextField id="rc-max" label="Or after this many invoices" optional inputMode="numeric" value={form.maxCount} onValue={(v) => set("maxCount", v.replace(/\D/g, ""))} error={errors.maxCount} />
      </div>
      <Field orientation="horizontal">
        <Checkbox id="rc-issue" checked={form.autoIssue} onCheckedChange={(c) => set("autoIssue", c === true)} />
        <FieldLabel htmlFor="rc-issue" className="font-normal">
          Issue automatically (off: each invoice waits as a draft for you to check)
        </FieldLabel>
      </Field>
      <Field orientation="horizontal" data-invalid={!!errors.autoEmail}>
        <Checkbox id="rc-email" checked={form.autoEmail} disabled={!form.autoIssue} onCheckedChange={(c) => set("autoEmail", c === true)} />
        <FieldLabel htmlFor="rc-email" className="font-normal">
          Email it to the customer when issued
        </FieldLabel>
      </Field>
      {errors.autoEmail ? <p className="text-sm text-destructive">{errors.autoEmail}</p> : null}
    </FieldGroup>
  );
}

const payload = (f: ScheduleForm) => ({ ...f, autoEmail: f.autoIssue && f.autoEmail });

function ScheduleDialog({ title, description, initial, startLocked, submitLabel, onSubmit, onClose }: { title: string; description: string; initial: ScheduleForm; startLocked?: boolean; submitLabel: string; onSubmit: (body: ReturnType<typeof payload>) => Promise<void>; onClose: () => void }) {
  const [form, setForm] = useState(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof ScheduleForm>(k: K, v: ScheduleForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const v = validateSchedule(payload(form));
            if (!v.ok) {
              setErrors(v.errors);
              focusFirstError();
              return;
            }
            start(async () => {
              setMessage(null);
              try {
                await onSubmit(payload(form));
              } catch (err) {
                setMessage(saveError(err, setErrors));
              }
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <div className="my-4">
            <ScheduleFields form={form} set={set} errors={errors} startLocked={startLocked} />
          </div>
          <DialogFooter>
            {message ? (
              <p role="alert" className="mr-auto text-sm text-destructive">
                {message}
              </p>
            ) : null}
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner data-icon="inline-start" /> : null}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** "Make recurring" on an invoice page. */
export function MakeRecurringButton({ invoiceId, number }: { invoiceId: string; number: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const tomorrow = addDays(todayInIndia(), 1);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <RepeatIcon data-icon="inline-start" />
        Make recurring
      </Button>
      {open ? (
        <ScheduleDialog
          title="Make this invoice recurring"
          description={`A new invoice with ${number ? `${number}'s` : "these"} customer, items, discounts and notes is created on each date.`}
          initial={{ name: "", frequency: "monthly", interval: "1", startDate: tomorrow, endDate: "", maxCount: "", dueDays: "", autoIssue: true, autoEmail: false }}
          submitLabel="Start schedule"
          onClose={() => setOpen(false)}
          onSubmit={async (body) => {
            const r = await api<{ id: string }>(BASE, { method: "POST", json: { ...body, invoiceId } });
            router.push(`/billing/recurring-invoices/${r.id}`);
          }}
        />
      ) : null}
    </>
  );
}

/* ---------------- List ---------------- */

type Row = { id: string; name: string; customerName: string; schedule: string; nextRunDate: string | null; generatedCount: number; totalPaise: number; status: State; autoIssue: boolean };

export function RecurringList() {
  const [state, setState] = useState("");
  const list = useRecordList<Row>(BASE, { state: state || null });
  const q = list.query;
  const filters = [
    { value: "", label: "All" },
    { value: "active", label: "Active" },
    { value: "paused", label: "Paused" },
    { value: "ended", label: "Ended" },
  ];
  return (
    <div className="flex flex-col gap-4">
      <SalesNav />
      <ListToolbar search={list.search} onSearch={list.setSearch} placeholder="Search name or customer">
        <Select items={filters} value={state} onValueChange={(v) => (setState(String(v ?? "")), list.setPage(1))}>
          <SelectTrigger className="h-10 w-full sm:w-36" aria-label="Show">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {filters.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </ListToolbar>
      {q.status === "loading" ? (
        <ListSkeleton />
      ) : !q.data ? (
        <LoadError message={q.error.message} onRetry={q.reload} />
      ) : q.data.items.length === 0 ? (
        <EmptyList
          Icon={CalendarSyncIcon}
          title="No recurring invoices yet"
          description="Open an invoice you send regularly and choose “Make recurring”. New invoices are then created on schedule."
          filtered={!!list.search || !!state}
          action={
            <Button variant="outline" render={<Link href="/billing/invoices" />} nativeButton={false}>
              Go to invoices
            </Button>
          }
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden md:table-cell">Schedule</TableHead>
                  <TableHead>Next invoice</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.data.items.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link href={`/billing/recurring-invoices/${r.id}`} className="font-medium hover:underline">
                        {r.name}
                      </Link>
                      <span className="block text-xs text-muted-foreground">{r.customerName}</span>
                    </TableCell>
                    <TableCell className="hidden text-sm md:table-cell">{r.schedule}</TableCell>
                    <TableCell className="whitespace-nowrap">{r.nextRunDate ? fmtDate(r.nextRunDate) : "—"}</TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatPaise(r.totalPaise)}</TableCell>
                    <TableCell>
                      <StateBadge status={r.status} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pager page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={list.setPage} />
        </>
      )}
    </div>
  );
}

/* ---------------- Detail ---------------- */

type Detail = {
  id: string;
  name: string;
  customerId: string;
  customerName: string;
  customerEmail: string | null;
  frequency: Frequency;
  interval: number;
  startDate: string;
  endDate: string | null;
  maxCount: number | null;
  nextRunDate: string | null;
  lastRunDate: string | null;
  generatedCount: number;
  dueDays: number | null;
  autoIssue: boolean;
  autoEmail: boolean;
  status: State;
  totalPaise: number;
  sourceInvoiceId: string | null;
  schedule: string;
  items: { description: string; quantity: string; ratePaise: number; taxRate: string }[];
  runs: { id: string; runDate: string; status: "created" | "issued" | "emailed" | "failed"; error: string | null; invoiceId: string | null; invoiceNumber: string | null; invoiceStatus: string | null; totalPaise: number | null }[];
  canEdit: boolean;
  readOnlyReason: string | null;
};
const RUN: Record<Detail["runs"][number]["status"], string> = { created: "Draft created", issued: "Issued", emailed: "Issued and emailed", failed: "Problem" };
const qty = (q: string) => (q.includes(".") ? q.replace(/\.?0+$/, "") : q);

export function RecurringView({ id }: { id: string }) {
  const q = useApiQuery<Detail>(`${BASE}/${id}`);
  const [dialog, setDialog] = useState<"edit" | "items" | "end" | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  if (q.status === "loading") return <Skeleton className="h-96 rounded-xl" aria-label="Loading" />;
  if (!q.data) return <LoadError message={q.error.message} onRetry={q.reload} />;
  const r = q.data;
  const act = (fn: () => Promise<string>) =>
    start(async () => {
      setMessage(null);
      try {
        setMessage({ ok: true, text: await fn() });
        q.reload();
      } catch (e) {
        setMessage({ ok: false, text: e instanceof ApiError ? e.message : "Something went wrong. Try again." });
      }
    });
  return (
    <div className="flex flex-col gap-4">
      <BackLink href="/billing/recurring-invoices">Recurring invoices</BackLink>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            {r.name} <StateBadge status={r.status} />
          </h2>
          <p className="text-sm text-muted-foreground">
            <Link href={`/billing/customers/${r.customerId}`} className="hover:underline">
              {r.customerName}
            </Link>{" "}
            · {r.schedule} · {formatPaise(r.totalPaise)} each
          </p>
        </div>
        {r.canEdit && r.status !== "ended" ? (
          <div className="flex flex-wrap gap-2">
            {r.status === "active" ? (
              <Button variant="outline" disabled={pending} onClick={() => act(async () => (await api<{ run: { status: string } }>(`${BASE}/${id}/run`, { method: "POST" }), "Next invoice created."))}>
                <ZapIcon data-icon="inline-start" />
                Create next now
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => setDialog("edit")}>
              <PencilIcon data-icon="inline-start" />
              Edit schedule
            </Button>
            <Button variant="outline" disabled={pending} onClick={() => act(async () => (await api(`${BASE}/${id}/status`, { method: "POST", json: { action: r.status === "active" ? "pause" : "resume" } }), r.status === "active" ? "Paused." : "Resumed."))}>
              {r.status === "active" ? <PauseIcon data-icon="inline-start" /> : <PlayIcon data-icon="inline-start" />}
              {r.status === "active" ? "Pause" : "Resume"}
            </Button>
            <Button variant="outline" onClick={() => setDialog("end")}>
              <SquareIcon data-icon="inline-start" />
              End
            </Button>
          </div>
        ) : null}
      </div>
      <ReadOnlyNote reason={r.readOnlyReason} />
      {message ? (
        <p role={message.ok ? "status" : "alert"} className={`text-sm ${message.ok ? "text-brand-green" : "text-destructive"}`}>
          {message.text}
        </p>
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-3">
        {[
          ["Next invoice", r.nextRunDate ? fmtDate(r.nextRunDate) : r.status === "ended" ? "Ended" : "—"],
          ["Created so far", `${r.generatedCount}${r.maxCount ? ` of ${r.maxCount}` : ""}`],
          ["Then", r.autoIssue ? (r.autoEmail ? "Issued and emailed" : "Issued") : "Kept as a draft"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border p-4">
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="mt-1 font-semibold">{value}</p>
          </div>
        ))}
      </div>
      {r.autoEmail && !r.customerEmail ? <p className="text-sm text-destructive">The customer has no email address, so invoices will be issued but not emailed.</p> : null}

      <Card size="sm">
        <CardHeader>
          <CardTitle>Items on each invoice</CardTitle>
          <CardDescription>
            Copied from {r.sourceInvoiceId ? <Link href={`/billing/invoices/${r.sourceInvoiceId}`} className="underline underline-offset-2">this invoice</Link> : "an invoice"}. Due {r.dueDays === null ? "on the customer's payment terms" : `${r.dueDays} days after each invoice date`}.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <ul className="flex flex-col divide-y text-sm">
            {r.items.map((i, k) => (
              <li key={k} className="flex justify-between gap-3 py-1.5">
                <span>{i.description}</span>
                <span className="tabular-nums text-muted-foreground">
                  {qty(i.quantity)} × {formatPaise(i.ratePaise)} · GST {qty(i.taxRate)}%
                </span>
              </li>
            ))}
          </ul>
          {r.canEdit && r.status !== "ended" ? (
            <Button size="sm" variant="outline" className="self-start" onClick={() => setDialog("items")}>
              Use items from another invoice
            </Button>
          ) : null}
        </CardContent>
      </Card>

      <section aria-labelledby="runs" className="flex flex-col gap-2">
        <h3 id="runs" className="font-medium">
          Invoices created
        </h3>
        {r.runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">None yet. The first is due {r.nextRunDate ? fmtDate(r.nextRunDate) : "—"}.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Scheduled for</TableHead>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {r.runs.map((x) => (
                  <TableRow key={x.id}>
                    <TableCell className="whitespace-nowrap">{fmtDate(x.runDate)}</TableCell>
                    <TableCell>
                      {x.invoiceId ? (
                        <Link href={`/billing/invoices/${x.invoiceId}`} className="font-medium hover:underline">
                          {x.invoiceNumber ?? "Draft"}
                        </Link>
                      ) : (
                        "—"
                      )}
                      {x.invoiceStatus ? <span className="ml-2 align-middle"><StatusBadge status={x.invoiceStatus} /></span> : null}
                    </TableCell>
                    <TableCell>
                      <span className={x.status === "failed" ? "text-destructive" : undefined}>{RUN[x.status]}</span>
                      {x.error ? <span className="block text-xs text-muted-foreground">{x.error}</span> : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{x.totalPaise === null ? "" : formatPaise(x.totalPaise)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
      <p className="text-xs text-muted-foreground">Invoices are created by the server&apos;s scheduled job (/api/cron/billing), dated on their scheduled day. If it was down, missed dates are created when it runs again.</p>

      {dialog === "edit" ? (
        <ScheduleDialog
          title="Edit schedule"
          description="Changes apply from the next invoice. Invoices already created stay as they are."
          initial={{
            name: r.name,
            frequency: r.frequency,
            interval: String(r.interval),
            startDate: r.startDate,
            endDate: r.endDate ?? "",
            maxCount: r.maxCount === null ? "" : String(r.maxCount),
            dueDays: r.dueDays === null ? "" : String(r.dueDays),
            autoIssue: r.autoIssue,
            autoEmail: r.autoEmail,
          }}
          startLocked={r.generatedCount > 0}
          submitLabel="Save"
          onClose={() => setDialog(null)}
          onSubmit={async (body) => {
            await api(`${BASE}/${id}`, { method: "PUT", json: body });
            setDialog(null);
            q.reload();
          }}
        />
      ) : null}
      {dialog === "items" ? <ReplaceItemsDialog id={id} customerId={r.customerId} onClose={() => setDialog(null)} onDone={() => (setDialog(null), q.reload())} /> : null}
      <AlertDialog open={dialog === "end"} onOpenChange={(o: boolean) => !o && setDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End this recurring invoice?</AlertDialogTitle>
            <AlertDialogDescription>No more invoices are created. Invoices already created stay. This can&apos;t be undone; pause instead if you might restart it.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => (setDialog(null), act(async () => (await api(`${BASE}/${id}/status`, { method: "POST", json: { action: "end" } }), "Ended.")))}>
              End it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ReplaceItemsDialog({ id, customerId, onClose, onDone }: { id: string; customerId: string; onClose: () => void; onDone: () => void }) {
  const invoices = useApiQuery<{ items: { id: string; number: string | null; status: string; issueDate: string; totalPaise: number }[] }>(`/api/business-billing/documents/invoices?customerId=${customerId}&pageSize=50`);
  const [invoiceId, setInvoiceId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const options = (invoices.data?.items ?? []).filter((i) => i.status !== "void").map((i) => ({ value: i.id, label: `${i.number ?? "Draft"} · ${fmtDate(i.issueDate)} · ${formatPaise(i.totalPaise)}` }));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Use items from another invoice</DialogTitle>
          <DialogDescription>Its items, discounts and notes are billed from the next invoice on. Tip: create a draft invoice with the new items first, then pick it here.</DialogDescription>
        </DialogHeader>
        <div className="my-4">
          <SelectField id="rc-source" label="Invoice" value={invoiceId} onValue={setInvoiceId} options={options} placeholder={invoices.status === "loading" ? "Loading…" : "Choose an invoice"} error={error ?? undefined} />
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!invoiceId || pending}
            onClick={() =>
              start(async () => {
                setError(null);
                try {
                  await api(`${BASE}/${id}/template`, { method: "POST", json: { invoiceId } });
                  onDone();
                } catch (e) {
                  setError(e instanceof ApiError ? (e.fields?.invoiceId ?? e.message) : "Couldn't update. Try again.");
                }
              })
            }
          >
            {pending ? <Spinner data-icon="inline-start" /> : null}
            Use these items
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
