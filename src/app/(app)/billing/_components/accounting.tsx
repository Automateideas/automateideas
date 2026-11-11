"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BookOpenIcon, CheckCircle2Icon, HistoryIcon, LandmarkIcon, PencilIcon, PlusIcon, Trash2Icon, TriangleAlertIcon, Undo2Icon } from "lucide-react";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, api, useApiQuery } from "@/lib/api";
import { ACCOUNT_TYPE_LABELS, type AccountType, SOURCE_LABELS } from "@/lib/business-billing/accounting/chart";
import { financialYearRange, validateAccount, validateJournal } from "@/lib/business-billing/accounting/validation";
import { todayInIndia } from "@/lib/business-billing/documents/types";
import { formatPaise } from "@/lib/business-billing/fields";

import { LoadError } from "../../_components/page-parts";
import { SectionNav } from "../../_components/section-nav";
import { fmtDate } from "./documents/documents-ui";
import { StatementExport } from "./report-export";
import { newKey, postOnce, toPaise } from "./payments";
import { BackLink, EmptyList, type Errors, ListSkeleton, ListToolbar, Pager, ReadOnlyNote, SelectField, TextField, focusFirstError, saveError, useRecordList } from "./records-ui";

const BASE = "/api/business-billing/accounting";
const TYPE_ORDER: AccountType[] = ["asset", "liability", "equity", "income", "expense"];
const TYPE_OPTIONS = TYPE_ORDER.map((t) => ({ value: t, label: ACCOUNT_TYPE_LABELS[t] }));

export function AccountingNav() {
  return (
    <SectionNav
      label="Accounting"
      links={[
        { href: "/billing/accounting", label: "Chart of accounts" },
        { href: "/billing/journal-entries", label: "Journal entries", matchNested: true },
        { href: "/billing/ledger", label: "Ledger" },
        { href: "/billing/trial-balance", label: "Trial balance" },
        { href: "/billing/profit-loss", label: "Profit & loss" },
        { href: "/billing/balance-sheet", label: "Balance sheet" },
      ]}
    />
  );
}

/** Where an automatic entry came from, as a link target. */
function sourceHref(sourceType: string, sourceId: string | null, party?: { customerId?: string | null; supplierId?: string | null }) {
  if (!sourceId) return null;
  if (sourceType.startsWith("document:")) return `/billing/${sourceType.slice("document:".length)}/${sourceId}`;
  if (sourceType === "payment_received") return `/billing/payments/${sourceId}`;
  if (sourceType === "payment_made") return `/billing/supplier-payments/${sourceId}`;
  if (sourceType === "refund") return "/billing/refunds";
  if (sourceType === "opening") return party?.supplierId ? `/billing/suppliers/${sourceId}` : `/billing/customers/${sourceId}`;
  return null;
}

const sourceLabel = (t: string) => SOURCE_LABELS[t] ?? t;

/** Amount with Dr/Cr, for balances that can sit on either side. */
const drCr = (paise: number, debitNormal: boolean) => {
  if (paise === 0) return formatPaise(0);
  const debit = debitNormal ? paise > 0 : paise < 0;
  return `${formatPaise(Math.abs(paise))} ${debit ? "Dr" : "Cr"}`;
};
const isDebitNormal = (t: string) => t === "asset" || t === "expense";

/* ---------------- Earlier records banner ---------------- */

type Backfill = { documents: number; payments: number; refunds: number; openingBalances: number; total: number };

function BackfillBanner({ canEdit, onDone }: { canEdit: boolean; onDone: () => void }) {
  const q = useApiQuery<Backfill>(`${BASE}/backfill`);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (!q.data || q.data.total === 0) return null;
  const d = q.data;
  const parts = [
    d.documents && `${d.documents} invoice${d.documents === 1 ? "" : "s"}, note${d.documents === 1 ? "" : "s"} or bill${d.documents === 1 ? "" : "s"}`,
    d.payments && `${d.payments} payment${d.payments === 1 ? "" : "s"}`,
    d.refunds && `${d.refunds} refund${d.refunds === 1 ? "" : "s"}`,
    d.openingBalances && `${d.openingBalances} opening balance${d.openingBalances === 1 ? "" : "s"}`,
  ].filter(Boolean);
  return (
    <Alert>
      <HistoryIcon />
      <AlertTitle>Some earlier records aren&apos;t in your books yet</AlertTitle>
      <AlertDescription>
        {parts.join(", ")} from before accounting was turned on. Posting them dates each entry as it happened, so your statements are complete.
        {error ? <span className="mt-1 block text-destructive">{error}</span> : null}
      </AlertDescription>
      {canEdit ? (
        <AlertAction>
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setError(null);
                try {
                  await api(`${BASE}/backfill`, { method: "POST" });
                  q.reload();
                  onDone();
                } catch (e) {
                  setError(e instanceof ApiError ? e.message : "Couldn't post them. Try again.");
                }
              })
            }
          >
            {pending ? <Spinner data-icon="inline-start" /> : null}
            Post {d.total} record{d.total === 1 ? "" : "s"}
          </Button>
        </AlertAction>
      ) : null}
    </Alert>
  );
}

/* ---------------- Chart of accounts ---------------- */

type Account = {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  isSystem: boolean;
  systemKey: string | null;
  parentId: string | null;
  archived: boolean;
  used: boolean;
  balancePaise: number;
};
type Chart = { accounts: Account[]; hasEntries: boolean; booksLockedUntil: string | null; canEdit: boolean; readOnlyReason: string | null };

export function ChartOfAccountsView() {
  const q = useApiQuery<Chart>(`${BASE}/accounts`);
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Account | "new" | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const archive = (a: Account, archived: boolean) =>
    start(async () => {
      setArchiveError(null);
      try {
        await api(`${BASE}/accounts/${a.id}/archive`, { method: "POST", json: { archived } });
        q.reload();
      } catch (e) {
        setArchiveError(e instanceof ApiError ? e.message : "Couldn't change that account.");
      }
    });

  return (
    <div className="flex flex-col gap-4">
      <AccountingNav />
      {q.status === "loading" ? (
        <ListSkeleton rows={8} />
      ) : !q.data ? (
        <LoadError message={q.error.message} onRetry={q.reload} />
      ) : (
        <>
          <BackfillBanner canEdit={q.data.canEdit} onDone={q.reload} />
          <ReadOnlyNote reason={q.data.readOnlyReason} />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Every invoice, bill and payment posts here automatically.
              {q.data.booksLockedUntil ? <> Books are closed up to {fmtDate(q.data.booksLockedUntil)}.</> : null}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowArchived((v) => !v)}>
                {showArchived ? "Hide archived" : "Show archived"}
              </Button>
              {q.data.canEdit ? (
                <Button size="sm" onClick={() => setEditing("new")}>
                  <PlusIcon data-icon="inline-start" />
                  Add account
                </Button>
              ) : null}
            </div>
          </div>
          {archiveError ? (
            <p role="alert" className="text-sm text-destructive">
              {archiveError}
            </p>
          ) : null}
          {TYPE_ORDER.map((type) => {
            const rows = q.data!.accounts.filter((a) => a.type === type && (showArchived || !a.archived));
            if (!rows.length) return null;
            const total = rows.filter((a) => !a.archived).reduce((s, a) => s + a.balancePaise, 0);
            return (
              <section key={type} aria-labelledby={`type-${type}`} className="overflow-x-auto rounded-xl border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead id={`type-${type}`} className="w-24">
                        {ACCOUNT_TYPE_LABELS[type]}
                      </TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      {q.data!.canEdit ? <TableHead className="w-24 text-right"><span className="sr-only">Actions</span></TableHead> : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((a) => (
                      <TableRow key={a.id} className={a.archived ? "text-muted-foreground" : undefined}>
                        <TableCell className="tabular-nums">{a.code}</TableCell>
                        <TableCell>
                          <Link href={`/billing/ledger?accountId=${a.id}`} className={`font-medium hover:underline ${a.parentId ? "pl-4" : ""}`}>
                            {a.name}
                          </Link>
                          {a.isSystem ? <Badge variant="outline" className="ml-2">Standard</Badge> : null}
                          {a.archived ? <Badge variant="secondary" className="ml-2">Archived</Badge> : null}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{a.used ? formatPaise(a.balancePaise) : <span className="text-muted-foreground">—</span>}</TableCell>
                        {q.data!.canEdit ? (
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="icon-sm" aria-label={`Edit ${a.name}`} onClick={() => setEditing(a)}>
                                <PencilIcon />
                              </Button>
                              {a.isSystem ? null : (
                                <Button variant="ghost" size="icon-sm" disabled={pending} aria-label={`${a.archived ? "Restore" : "Archive"} ${a.name}`} onClick={() => archive(a, !a.archived)}>
                                  {a.archived ? <Undo2Icon /> : <Trash2Icon />}
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={2}>Total {ACCOUNT_TYPE_LABELS[type].toLowerCase()}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatPaise(total)}</TableCell>
                      {q.data!.canEdit ? <TableCell /> : null}
                    </TableRow>
                  </TableFooter>
                </Table>
              </section>
            );
          })}
          <p className="text-xs text-muted-foreground">Balances are shown on each account&apos;s normal side: assets and expenses as debits; liabilities, equity and income as credits. A negative figure sits on the other side.</p>
        </>
      )}
      {editing && q.data ? (
        <AccountDialog
          account={editing === "new" ? null : editing}
          parents={q.data.accounts.filter((a) => !a.parentId && !a.archived && (editing === "new" || a.id !== editing.id))}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            q.reload();
          }}
        />
      ) : null}
    </div>
  );
}

function AccountDialog({ account, parents, onClose, onSaved }: { account: Account | null; parents: Account[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ code: account?.code ?? "", name: account?.name ?? "", type: account?.type ?? "expense", parentId: account?.parentId ?? "" });
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const typeLocked = !!account && (account.isSystem || account.used);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = { ...form, parentId: form.parentId || null };
    const v = validateAccount(raw);
    if (!v.ok) {
      setErrors(v.errors);
      focusFirstError();
      return;
    }
    start(async () => {
      setMessage(null);
      try {
        await api(account ? `${BASE}/accounts/${account.id}` : `${BASE}/accounts`, { method: account ? "PUT" : "POST", json: raw });
        onSaved();
      } catch (err) {
        setMessage(saveError(err, setErrors));
      }
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>{account ? "Edit account" : "Add an account"}</DialogTitle>
            <DialogDescription>
              {account?.isSystem ? "A standard account: automatic postings use it whatever you call it." : "For expenses, assets or income you track yourself, e.g. Rent or Office equipment."}
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className="my-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <TextField id="acc-code" label="Code" value={form.code} onValue={(v) => set("code", v)} error={errors.code} autoComplete="off" />
              <TextField id="acc-name" label="Name" value={form.name} onValue={(v) => set("name", v)} error={errors.name} className="sm:col-span-2" autoComplete="off" />
            </div>
            <SelectField
              id="acc-type"
              label="Type"
              value={form.type}
              onValue={(v) => set("type", v || "expense")}
              options={TYPE_OPTIONS}
              error={errors.type}
              disabled={typeLocked}
              hint={typeLocked ? (account?.isSystem ? "Standard accounts keep their type." : "Entries are posted to it, so its type is fixed.") : undefined}
            />
            <SelectField
              id="acc-parent"
              label="Group under"
              optional
              value={form.parentId}
              onValue={(v) => set("parentId", v)}
              noneLabel="No group (top level)"
              options={parents.filter((p) => p.type === form.type).map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` }))}
              error={errors.parentId}
            />
          </FieldGroup>
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
              {account ? "Save" : "Add account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Journal ---------------- */

type JournalRow = { id: string; number: string | null; entryDate: string; narration: string | null; sourceType: string; sourceId: string | null; reversesEntryId: string | null; reversedById: string | null; amountPaise: number };

const SOURCE_FILTERS = [
  { value: "all", label: "All entries" },
  { value: "automatic", label: "Automatic" },
  { value: "manual", label: "Manual" },
];

export function JournalList() {
  const [source, setSource] = useState("all");
  const list = useRecordList<JournalRow>(`${BASE}/journal`, { source: source === "all" ? null : source });
  const q = list.query;
  return (
    <div className="flex flex-col gap-4">
      <AccountingNav />
      <ListToolbar search={list.search} onSearch={list.setSearch} placeholder="Search number or narration">
        <Select items={SOURCE_FILTERS} value={source} onValueChange={(v) => v && (setSource(String(v)), list.setPage(1))}>
          <SelectTrigger className="h-10 w-36" aria-label="Show">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SOURCE_FILTERS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {q.data?.canEdit ? (
          <Button className="h-10" render={<Link href="/billing/journal-entries/create" />} nativeButton={false}>
            <PlusIcon data-icon="inline-start" />
            New entry
          </Button>
        ) : null}
      </ListToolbar>
      {q.status === "loading" ? (
        <ListSkeleton />
      ) : !q.data ? (
        <LoadError message={q.error.message} onRetry={q.reload} />
      ) : q.data.items.length === 0 ? (
        <EmptyList
          Icon={BookOpenIcon}
          title="No journal entries yet"
          description="Entries appear as you issue invoices, record bills and take payments. Add a manual entry for anything else."
          filtered={!!list.search || source !== "all"}
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Entry</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="hidden md:table-cell">Narration</TableHead>
                  <TableHead className="hidden sm:table-cell">From</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.data.items.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>
                      <Link href={`/billing/journal-entries/${e.id}`} className="font-medium hover:underline">
                        {e.number ?? "—"}
                      </Link>
                      {e.reversesEntryId ? <Badge variant="secondary" className="ml-2">Reversal</Badge> : null}
                      {e.reversedById ? <Badge variant="outline" className="ml-2">Reversed</Badge> : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{fmtDate(e.entryDate)}</TableCell>
                    <TableCell className="hidden max-w-md truncate md:table-cell">{e.narration}</TableCell>
                    <TableCell className="hidden sm:table-cell">{sourceLabel(e.sourceType)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatPaise(e.amountPaise)}</TableCell>
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

type Lookups = {
  accounts: { id: string; code: string; name: string; type: AccountType; systemKey: string | null }[];
  customers: { id: string; name: string }[];
  suppliers: { id: string; name: string }[];
  booksLockedUntil: string | null;
};
type FormLine = { key: string; accountId: string; party: string; description: string; debit: string; credit: string };
const blankLine = (): FormLine => ({ key: newKey(), accountId: "", party: "", description: "", debit: "", credit: "" });

export function JournalEntryForm() {
  const router = useRouter();
  const lookups = useApiQuery<Lookups>(`${BASE}/journal/lookups`);
  const [form, setForm] = useState({ date: todayInIndia(), narration: "" });
  const [lines, setLines] = useState<FormLine[]>(() => [blankLine(), blankLine()]);
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [key] = useState(newKey);
  const [pending, start] = useTransition();

  const accountOptions = useMemo(() => (lookups.data?.accounts ?? []).map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` })), [lookups.data]);
  const partyOptions = useMemo(
    () => [
      ...(lookups.data?.customers ?? []).map((c) => ({ value: `c:${c.id}`, label: `${c.name} (customer)` })),
      ...(lookups.data?.suppliers ?? []).map((s) => ({ value: `s:${s.id}`, label: `${s.name} (supplier)` })),
    ],
    [lookups.data],
  );
  const dr = lines.reduce((s, l) => s + (toPaise(l.debit) ?? 0), 0);
  const cr = lines.reduce((s, l) => s + (toPaise(l.credit) ?? 0), 0);
  const setLine = (i: number, patch: Partial<FormLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  const payload = () => ({
    ...form,
    lines: lines.map((l) => ({
      accountId: l.accountId || null,
      customerId: l.party.startsWith("c:") ? l.party.slice(2) : null,
      supplierId: l.party.startsWith("s:") ? l.party.slice(2) : null,
      description: l.description,
      debit: l.debit,
      credit: l.credit,
    })),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = payload();
    const v = validateJournal(raw);
    if (!v.ok) {
      setErrors(v.errors);
      setMessage(v.errors.lines ?? "Check the highlighted fields.");
      focusFirstError();
      return;
    }
    start(async () => {
      setErrors({});
      setMessage(null);
      try {
        const entry = await postOnce<{ id: string }>(`${BASE}/journal`, key, raw);
        router.push(`/billing/journal-entries/${entry.id}`);
      } catch (err) {
        setMessage(saveError(err, setErrors));
      }
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <BackLink href="/billing/journal-entries">Journal entries</BackLink>
      {lookups.status === "loading" ? (
        <ListSkeleton />
      ) : !lookups.data ? (
        <LoadError message={lookups.error.message} onRetry={lookups.reload} />
      ) : (
        <form onSubmit={submit} noValidate className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>New journal entry</CardTitle>
              <CardDescription>
                For anything billing doesn&apos;t post itself: capital introduced, rent paid, depreciation, corrections. Debits must equal credits. Posted entries can&apos;t be edited; you reverse them instead.
                {lookups.data.booksLockedUntil ? <> Books are closed up to {fmtDate(lookups.data.booksLockedUntil)}.</> : null}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <TextField id="je-date" label="Date" type="date" value={form.date} onValue={(v) => setForm((f) => ({ ...f, date: v }))} error={errors.date} />
              <Field data-invalid={!!errors.narration} className="sm:col-span-2">
                <FieldLabel htmlFor="je-narration">Narration</FieldLabel>
                <Textarea id="je-narration" rows={2} value={form.narration} onChange={(e) => setForm((f) => ({ ...f, narration: e.target.value }))} aria-invalid={!!errors.narration} placeholder="e.g. Office rent for November" />
                <FieldError>{errors.narration}</FieldError>
              </Field>
            </CardContent>
          </Card>

          <div className="overflow-x-auto rounded-xl border">
            <Table className="min-w-[760px]">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[30%]">Account</TableHead>
                  <TableHead className="w-[22%]">Customer or supplier</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-32 text-right">Debit (₹)</TableHead>
                  <TableHead className="w-32 text-right">Credit (₹)</TableHead>
                  <TableHead className="w-10"><span className="sr-only">Remove</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l, i) => (
                  <TableRow key={l.key} className="align-top">
                    <TableCell>
                      <SelectField id={`je-acc-${i}`} label={`Line ${i + 1} account`} value={l.accountId} onValue={(v) => setLine(i, { accountId: v })} options={accountOptions} error={errors[`lines.${i}.accountId`]} className="[&>label]:sr-only" />
                    </TableCell>
                    <TableCell>
                      <SelectField id={`je-party-${i}`} label={`Line ${i + 1} party`} value={l.party} onValue={(v) => setLine(i, { party: v })} noneLabel="—" options={partyOptions} error={errors[`lines.${i}.customerId`] ?? errors[`lines.${i}.supplierId`]} className="[&>label]:sr-only" />
                    </TableCell>
                    <TableCell>
                      <Input aria-label={`Line ${i + 1} description`} value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} />
                    </TableCell>
                    <TableCell>
                      <Input
                        aria-label={`Line ${i + 1} debit`}
                        inputMode="decimal"
                        className="text-right tabular-nums"
                        value={l.debit}
                        aria-invalid={!!errors[`lines.${i}.debit`]}
                        onChange={(e) => setLine(i, { debit: e.target.value.replace(/[^\d.,]/g, ""), ...(e.target.value ? { credit: "" } : {}) })}
                      />
                      {errors[`lines.${i}.debit`] ? <p className="mt-1 text-xs text-destructive">{errors[`lines.${i}.debit`]}</p> : null}
                    </TableCell>
                    <TableCell>
                      <Input
                        aria-label={`Line ${i + 1} credit`}
                        inputMode="decimal"
                        className="text-right tabular-nums"
                        value={l.credit}
                        aria-invalid={!!errors[`lines.${i}.credit`]}
                        onChange={(e) => setLine(i, { credit: e.target.value.replace(/[^\d.,]/g, ""), ...(e.target.value ? { debit: "" } : {}) })}
                      />
                    </TableCell>
                    <TableCell>
                      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove line ${i + 1}`} disabled={lines.length <= 2} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
                        <Trash2Icon />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3}>
                    <Button type="button" variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, blankLine()])}>
                      <PlusIcon data-icon="inline-start" />
                      Add line
                    </Button>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatPaise(dr)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatPaise(cr)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            </Table>
          </div>
          <p className={`text-sm ${dr === cr && dr > 0 ? "text-brand-green" : "text-muted-foreground"}`} aria-live="polite">
            {dr === cr ? (dr > 0 ? "Balanced." : "Enter the amounts.") : `Out of balance by ${formatPaise(Math.abs(dr - cr))}.`}
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button type="submit" disabled={pending}>
              {pending ? <Spinner data-icon="inline-start" /> : null}
              Post entry
            </Button>
            <Button variant="ghost" render={<Link href="/billing/journal-entries" />} nativeButton={false}>
              Cancel
            </Button>
            {message ? (
              <p role="alert" className="text-sm text-destructive">
                {message}
              </p>
            ) : null}
          </div>
        </form>
      )}
    </div>
  );
}

type EntryLine = {
  lineNo: number;
  accountId: string;
  accountCode: string;
  accountName: string;
  customerId: string | null;
  customerName: string | null;
  supplierId: string | null;
  supplierName: string | null;
  debitPaise: number;
  creditPaise: number;
  description: string | null;
};
type Entry = {
  id: string;
  number: string | null;
  entryDate: string;
  narration: string | null;
  sourceType: string;
  sourceId: string | null;
  reverses: { id: string; number: string | null; entryDate: string } | null;
  reversedBy: { id: string; number: string | null; entryDate: string } | null;
  lines: EntryLine[];
  totalPaise: number;
  canEdit: boolean;
  readOnlyReason: string | null;
};

export function JournalEntryView({ id }: { id: string }) {
  const q = useApiQuery<Entry>(`${BASE}/journal/${id}`);
  const [reversing, setReversing] = useState(false);
  if (q.status === "loading") return <Skeleton className="h-72 rounded-xl" aria-label="Loading" />;
  if (!q.data) return <LoadError message={q.error.message} onRetry={q.reload} />;
  const e = q.data;
  const party = e.lines.find((l) => l.customerId || l.supplierId);
  const href = sourceHref(e.sourceType, e.sourceId, party ?? undefined);
  const canReverse = e.canEdit && e.sourceType === "manual" && !e.reverses && !e.reversedBy;
  return (
    <div className="flex flex-col gap-4">
      <BackLink href="/billing/journal-entries">Journal entries</BackLink>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">
            {e.number ?? "Journal entry"}
            {e.reverses ? <Badge variant="secondary" className="ml-2 align-middle">Reversal</Badge> : null}
            {e.reversedBy ? <Badge variant="outline" className="ml-2 align-middle">Reversed</Badge> : null}
          </h2>
          <p className="text-sm text-muted-foreground">
            {fmtDate(e.entryDate)} · {sourceLabel(e.sourceType)}
            {href ? (
              <>
                {" · "}
                <Link href={href} className="underline underline-offset-2">
                  Open the {sourceLabel(e.sourceType).toLowerCase()}
                </Link>
              </>
            ) : null}
          </p>
        </div>
        {canReverse ? (
          <Button variant="outline" onClick={() => setReversing(true)}>
            <Undo2Icon data-icon="inline-start" />
            Reverse entry
          </Button>
        ) : null}
      </div>
      {e.narration ? <p className="text-sm">{e.narration}</p> : null}
      {e.reverses ? (
        <p className="text-sm text-muted-foreground">
          Reverses <Link href={`/billing/journal-entries/${e.reverses.id}`} className="underline underline-offset-2">{e.reverses.number}</Link> of {fmtDate(e.reverses.entryDate)}.
        </p>
      ) : null}
      {e.reversedBy ? (
        <p className="text-sm text-muted-foreground">
          Reversed by <Link href={`/billing/journal-entries/${e.reversedBy.id}`} className="underline underline-offset-2">{e.reversedBy.number}</Link> on {fmtDate(e.reversedBy.entryDate)}.
        </p>
      ) : null}
      {e.sourceType !== "manual" && !e.reverses && !e.reversedBy && e.canEdit ? (
        <p className="text-xs text-muted-foreground">Posted automatically. To undo it, void the record it came from; that posts the reversal.</p>
      ) : null}
      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Account</TableHead>
              <TableHead className="hidden sm:table-cell">Details</TableHead>
              <TableHead className="text-right">Debit</TableHead>
              <TableHead className="text-right">Credit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {e.lines.map((l) => (
              <TableRow key={l.lineNo}>
                <TableCell>
                  <Link href={`/billing/ledger?accountId=${l.accountId}`} className="hover:underline">
                    <span className="tabular-nums text-muted-foreground">{l.accountCode}</span> {l.accountName}
                  </Link>
                </TableCell>
                <TableCell className="hidden text-muted-foreground sm:table-cell">{[l.customerName ?? l.supplierName, l.description].filter(Boolean).join(" · ") || "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{l.debitPaise ? formatPaise(l.debitPaise) : ""}</TableCell>
                <TableCell className="text-right tabular-nums">{l.creditPaise ? formatPaise(l.creditPaise) : ""}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={2} className="hidden sm:table-cell">Total</TableCell>
              <TableCell className="sm:hidden">Total</TableCell>
              <TableCell className="text-right tabular-nums">{formatPaise(e.totalPaise)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatPaise(e.totalPaise)}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
      {reversing ? <ReverseDialog id={e.id} number={e.number} entryDate={e.entryDate} onClose={() => setReversing(false)} /> : null}
    </div>
  );
}

function ReverseDialog({ id, number, entryDate, onClose }: { id: string; number: string | null; entryDate: string; onClose: () => void }) {
  const router = useRouter();
  const [form, setForm] = useState({ date: todayInIndia() < entryDate ? entryDate : todayInIndia(), reason: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.reason.trim()) {
              setErrors({ reason: "Say why it's being reversed." });
              focusFirstError();
              return;
            }
            start(async () => {
              setMessage(null);
              try {
                const rev = await api<{ id: string }>(`${BASE}/journal/${id}/reverse`, { method: "POST", json: form });
                router.push(`/billing/journal-entries/${rev.id}`);
              } catch (err) {
                setMessage(saveError(err, setErrors));
              }
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Reverse {number}?</DialogTitle>
            <DialogDescription>This posts a new entry with every debit and credit swapped. The original stays in the journal.</DialogDescription>
          </DialogHeader>
          <FieldGroup className="my-4">
            <TextField id="rev-date" label="Reversal date" type="date" value={form.date} onValue={(v) => setForm((f) => ({ ...f, date: v }))} error={errors.date} />
            <Field data-invalid={!!errors.reason}>
              <FieldLabel htmlFor="rev-reason">Reason</FieldLabel>
              <Textarea id="rev-reason" rows={2} value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} aria-invalid={!!errors.reason} placeholder="e.g. Posted to the wrong account" />
              <FieldError>{errors.reason}</FieldError>
            </Field>
          </FieldGroup>
          <DialogFooter>
            {message ? (
              <p role="alert" className="mr-auto text-sm text-destructive">
                {message}
              </p>
            ) : null}
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending ? <Spinner data-icon="inline-start" /> : null}
              Reverse entry
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Report periods ---------------- */

export type AccountingSettings = Settings;
type Settings = { configured: boolean; booksLockedUntil: string | null; financialYearStartMonth: number; today: string; financialYear: { from: string; to: string; label: string }; canEdit: boolean; readOnlyReason: string | null };

export function useSettings() {
  return useApiQuery<Settings>(`${BASE}/settings`);
}

function presets(s: Settings) {
  const fy = s.financialYear;
  const lastFy = financialYearRange(prevDay(fy.from), s.financialYearStartMonth);
  const monthStart = `${s.today.slice(0, 7)}-01`;
  return [
    { label: `This year (${fy.label})`, from: fy.from, to: s.today },
    { label: `Last year (${lastFy.label})`, from: lastFy.from, to: lastFy.to },
    { label: "This month", from: monthStart, to: s.today },
  ];
}
const prevDay = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);

export function PeriodPicker({ from, to, onChange, settings }: { from: string; to: string; onChange: (from: string, to: string) => void; settings: Settings }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
      <Field className="sm:w-40">
        <FieldLabel htmlFor="period-from">From</FieldLabel>
        <Input id="period-from" type="date" value={from} max={to} onChange={(e) => e.target.value && onChange(e.target.value, to)} />
      </Field>
      <Field className="sm:w-40">
        <FieldLabel htmlFor="period-to">To</FieldLabel>
        <Input id="period-to" type="date" value={to} min={from} onChange={(e) => e.target.value && onChange(from, e.target.value)} />
      </Field>
      <div className="flex flex-wrap gap-2">
        {presets(settings).map((p) => (
          <Button key={p.label} type="button" size="sm" variant={p.from === from && p.to === to ? "secondary" : "outline"} onClick={() => onChange(p.from, p.to)}>
            {p.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function AsOfPicker({ asOf, onChange, settings }: { asOf: string; onChange: (d: string) => void; settings: Settings }) {
  const lastFyEnd = prevDay(settings.financialYear.from);
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <Field className="sm:w-44">
        <FieldLabel htmlFor="as-of">As of</FieldLabel>
        <Input id="as-of" type="date" value={asOf} onChange={(e) => e.target.value && onChange(e.target.value)} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant={asOf === settings.today ? "secondary" : "outline"} onClick={() => onChange(settings.today)}>
          Today
        </Button>
        <Button type="button" size="sm" variant={asOf === lastFyEnd ? "secondary" : "outline"} onClick={() => onChange(lastFyEnd)}>
          End of last year ({fmtDate(lastFyEnd)})
        </Button>
      </div>
    </div>
  );
}

function ReportShell({ children, settings }: { children: (s: Settings) => React.ReactNode; settings: ReturnType<typeof useSettings> }) {
  return (
    <div className="flex flex-col gap-4">
      <AccountingNav />
      {settings.status === "loading" ? <ListSkeleton /> : !settings.data ? <LoadError message={settings.error.message} onRetry={settings.reload} /> : children(settings.data)}
    </div>
  );
}

function BalancedNote({ balanced, what }: { balanced: boolean; what: string }) {
  return balanced ? (
    <p className="flex items-center gap-1.5 text-sm text-brand-green">
      <CheckCircle2Icon className="size-4" aria-hidden="true" />
      {what}
    </p>
  ) : (
    <Alert variant="destructive">
      <TriangleAlertIcon />
      <AlertTitle>The books don&apos;t balance</AlertTitle>
      <AlertDescription>This shouldn&apos;t happen. Contact support with the date shown.</AlertDescription>
    </Alert>
  );
}

/* ---------------- Ledger ---------------- */

type Ledger = {
  account: { id: string; code: string; name: string; type: AccountType };
  from: string;
  to: string;
  openingPaise: number;
  closingPaise: number;
  debitPaise: number;
  creditPaise: number;
  truncated: boolean;
  lines: { entryId: string; number: string | null; date: string; narration: string | null; sourceType: string; description: string | null; debitPaise: number; creditPaise: number; balancePaise: number }[];
};

export function LedgerView() {
  const settings = useSettings();
  return <ReportShell settings={settings}>{(s) => <LedgerBody settings={s} />}</ReportShell>;
}

function LedgerBody({ settings }: { settings: Settings }) {
  const params = useSearchParams();
  const router = useRouter();
  const lookups = useApiQuery<Lookups>(`${BASE}/journal/lookups`);
  const accountId = params.get("accountId") ?? "";
  const [period, setPeriod] = useState({ from: settings.financialYear.from, to: settings.today });
  const options = (lookups.data?.accounts ?? []).map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` }));
  return (
    <>
      <div className="flex flex-col gap-4">
        <SelectField
          id="ledger-account"
          label="Account"
          value={accountId}
          onValue={(v) => router.replace(v ? `/billing/ledger?accountId=${v}` : "/billing/ledger", { scroll: false })}
          options={options}
          placeholder={lookups.status === "loading" ? "Loading accounts…" : "Choose an account"}
          className="sm:max-w-md"
        />
        <PeriodPicker from={period.from} to={period.to} settings={settings} onChange={(from, to) => setPeriod({ from, to })} />
      </div>
      {accountId ? (
        <LedgerTable accountId={accountId} from={period.from} to={period.to} />
      ) : (
        <EmptyList Icon={LandmarkIcon} title="Pick an account" description="See every entry posted to it, with a running balance." filtered={false} />
      )}
    </>
  );
}

function LedgerTable({ accountId, from, to }: { accountId: string; from: string; to: string }) {
  const q = useApiQuery<Ledger>(`${BASE}/ledger?${new URLSearchParams({ accountId, from, to })}`);
  if (q.status === "loading") return <ListSkeleton />;
  if (!q.data) return <LoadError message={q.error.message} onRetry={q.reload} />;
  const l = q.data;
  const dn = isDebitNormal(l.account.type);
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Entry</TableHead>
              <TableHead className="hidden md:table-cell">Narration</TableHead>
              <TableHead className="text-right">Debit</TableHead>
              <TableHead className="text-right">Credit</TableHead>
              <TableHead className="text-right">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow className="bg-muted/40">
              <TableCell>{fmtDate(l.from)}</TableCell>
              <TableCell colSpan={2} className="font-medium">Opening balance</TableCell>
              <TableCell className="hidden md:table-cell" />
              <TableCell />
              <TableCell className="text-right tabular-nums">{drCr(l.openingPaise, dn)}</TableCell>
            </TableRow>
            {l.lines.map((r, i) => (
              <TableRow key={`${r.entryId}-${i}`}>
                <TableCell className="whitespace-nowrap">{fmtDate(r.date)}</TableCell>
                <TableCell>
                  <Link href={`/billing/journal-entries/${r.entryId}`} className="hover:underline">
                    {r.number}
                  </Link>
                  <span className="block text-xs text-muted-foreground">{sourceLabel(r.sourceType)}</span>
                </TableCell>
                <TableCell className="hidden max-w-sm truncate md:table-cell">{r.description ? `${r.narration} · ${r.description}` : r.narration}</TableCell>
                <TableCell className="text-right tabular-nums">{r.debitPaise ? formatPaise(r.debitPaise) : ""}</TableCell>
                <TableCell className="text-right tabular-nums">{r.creditPaise ? formatPaise(r.creditPaise) : ""}</TableCell>
                <TableCell className="text-right tabular-nums">{drCr(r.balancePaise, dn)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={2}>Closing balance, {fmtDate(l.to)}</TableCell>
              <TableCell className="hidden md:table-cell" />
              <TableCell className="text-right tabular-nums">{formatPaise(l.debitPaise)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatPaise(l.creditPaise)}</TableCell>
              <TableCell className="text-right tabular-nums">{drCr(l.closingPaise, dn)}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
      {l.lines.length === 0 ? <p className="text-sm text-muted-foreground">Nothing posted to this account in this period.</p> : null}
      {l.truncated ? <p className="text-sm text-muted-foreground">Showing the first 1,000 entries. Choose a shorter period to see the rest.</p> : null}
    </div>
  );
}

/* ---------------- Trial balance ---------------- */

type TrialBalance = { asOf: string; rows: { id: string; code: string; name: string; type: AccountType; debitPaise: number; creditPaise: number }[]; debitPaise: number; creditPaise: number; balanced: boolean };

export function TrialBalanceView() {
  const settings = useSettings();
  return <ReportShell settings={settings}>{(s) => <TrialBalanceBody settings={s} />}</ReportShell>;
}

function TrialBalanceBody({ settings }: { settings: Settings }) {
  const [asOf, setAsOf] = useState(settings.today);
  const q = useApiQuery<TrialBalance>(`${BASE}/trial-balance?asOf=${asOf}`);
  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <AsOfPicker asOf={asOf} onChange={setAsOf} settings={settings} />
        <StatementExport report="trial-balance" asOf={asOf} />
      </div>
      {q.status === "loading" ? (
        <ListSkeleton />
      ) : !q.data ? (
        <LoadError message={q.error.message} onRetry={q.reload} />
      ) : q.data.rows.length === 0 ? (
        <EmptyList Icon={BookOpenIcon} title="Nothing posted yet" description="Balances appear once you issue invoices, record bills or take payments." filtered={false} />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Code</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead className="hidden sm:table-cell">Type</TableHead>
                  <TableHead className="text-right">Debit</TableHead>
                  <TableHead className="text-right">Credit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.data.rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="tabular-nums">{r.code}</TableCell>
                    <TableCell>
                      <Link href={`/billing/ledger?accountId=${r.id}`} className="hover:underline">
                        {r.name}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">{ACCOUNT_TYPE_LABELS[r.type]}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.debitPaise ? formatPaise(r.debitPaise) : ""}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.creditPaise ? formatPaise(r.creditPaise) : ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={2}>Total</TableCell>
                  <TableCell className="hidden sm:table-cell" />
                  <TableCell className="text-right tabular-nums">{formatPaise(q.data.debitPaise)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatPaise(q.data.creditPaise)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
          <BalancedNote balanced={q.data.balanced} what={`Debits equal credits as of ${fmtDate(q.data.asOf)}.`} />
        </>
      )}
    </>
  );
}

/* ---------------- Statements ---------------- */

type Section = { lines: { id: string; code: string; name: string; amountPaise: number }[]; totalPaise: number };

function StatementSection({ title, section, extra, totalLabel }: { title: string; section: Section; extra?: { label: string; amountPaise: number }[]; totalLabel: string }) {
  return (
    <section aria-label={title} className="overflow-x-auto rounded-xl border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{title}</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {section.lines.length === 0 && !extra?.length ? (
            <TableRow>
              <TableCell colSpan={2} className="text-muted-foreground">Nothing yet.</TableCell>
            </TableRow>
          ) : null}
          {section.lines.map((l) => (
            <TableRow key={l.id}>
              <TableCell>
                <Link href={`/billing/ledger?accountId=${l.id}`} className="hover:underline">
                  <span className="tabular-nums text-muted-foreground">{l.code}</span> {l.name}
                </Link>
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatPaise(l.amountPaise)}</TableCell>
            </TableRow>
          ))}
          {extra?.map((x) => (
            <TableRow key={x.label}>
              <TableCell>{x.label}</TableCell>
              <TableCell className="text-right tabular-nums">{formatPaise(x.amountPaise)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell>{totalLabel}</TableCell>
            <TableCell className="text-right tabular-nums">{formatPaise(section.totalPaise)}</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </section>
  );
}

type ProfitLoss = { from: string; to: string; income: Section; expenses: Section; netProfitPaise: number };

export function ProfitLossView() {
  const settings = useSettings();
  return <ReportShell settings={settings}>{(s) => <ProfitLossBody settings={s} />}</ReportShell>;
}

function ProfitLossBody({ settings }: { settings: Settings }) {
  const [period, setPeriod] = useState({ from: settings.financialYear.from, to: settings.today });
  const q = useApiQuery<ProfitLoss>(`${BASE}/profit-loss?${new URLSearchParams(period)}`);
  return (
    <>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <PeriodPicker from={period.from} to={period.to} settings={settings} onChange={(from, to) => setPeriod({ from, to })} />
        <StatementExport report="profit-loss" from={period.from} to={period.to} />
      </div>
      {q.status === "loading" ? (
        <ListSkeleton />
      ) : !q.data ? (
        <LoadError message={q.error.message} onRetry={q.reload} />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <StatementSection title="Income" section={q.data.income} totalLabel="Total income" />
            <StatementSection title="Expenses" section={q.data.expenses} totalLabel="Total expenses" />
          </div>
          <div className="flex items-center justify-between rounded-xl border p-4">
            <div>
              <p className="font-medium">{q.data.netProfitPaise >= 0 ? "Net profit" : "Net loss"}</p>
              <p className="text-sm text-muted-foreground">
                {fmtDate(q.data.from)} to {fmtDate(q.data.to)}
              </p>
            </div>
            <p className={`text-2xl font-semibold tabular-nums ${q.data.netProfitPaise < 0 ? "text-destructive" : ""}`}>{formatPaise(Math.abs(q.data.netProfitPaise))}</p>
          </div>
          <p className="text-xs text-muted-foreground">Accrual basis: sales count when invoiced and purchases when billed, not when paid. GST collected and paid sits in the balance sheet, not here.</p>
        </>
      )}
    </>
  );
}

type BalanceSheet = {
  asOf: string;
  financialYear: { from: string; to: string; label: string };
  assets: Section;
  liabilities: Section;
  equity: Section & { retainedPaise: number; currentProfitPaise: number };
  liabilitiesAndEquityPaise: number;
  balanced: boolean;
};

export function BalanceSheetView() {
  const settings = useSettings();
  return <ReportShell settings={settings}>{(s) => <BalanceSheetBody settings={s} />}</ReportShell>;
}

function BalanceSheetBody({ settings }: { settings: Settings }) {
  const [asOf, setAsOf] = useState(settings.today);
  const q = useApiQuery<BalanceSheet>(`${BASE}/balance-sheet?asOf=${asOf}`);
  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <AsOfPicker asOf={asOf} onChange={setAsOf} settings={settings} />
        <StatementExport report="balance-sheet" asOf={asOf} />
      </div>
      {q.status === "loading" ? (
        <ListSkeleton />
      ) : !q.data ? (
        <LoadError message={q.error.message} onRetry={q.reload} />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <StatementSection title="Assets" section={q.data.assets} totalLabel="Total assets" />
            <div className="flex flex-col gap-4">
              <StatementSection title="Liabilities" section={q.data.liabilities} totalLabel="Total liabilities" />
              <StatementSection
                title="Equity"
                section={q.data.equity}
                totalLabel="Total equity"
                extra={[
                  ...(q.data.equity.retainedPaise ? [{ label: "Profit from earlier years", amountPaise: q.data.equity.retainedPaise }] : []),
                  { label: `Profit this year (${q.data.financialYear.label}) to date`, amountPaise: q.data.equity.currentProfitPaise },
                ]}
              />
              <div className="flex items-center justify-between rounded-xl border px-4 py-3 text-sm font-medium">
                <span>Liabilities and equity</span>
                <span className="tabular-nums">{formatPaise(q.data.liabilitiesAndEquityPaise)}</span>
              </div>
            </div>
          </div>
          <BalancedNote balanced={q.data.balanced} what={`Assets equal liabilities plus equity as of ${fmtDate(q.data.asOf)}.`} />
        </>
      )}
    </>
  );
}

/* ---------------- Settings: closing the books ---------------- */

export function AccountingSettingsView() {
  const q = useSettings();
  const [value, setValue] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  if (q.status === "loading") return <Skeleton className="h-56 rounded-xl" aria-label="Loading" />;
  if (!q.data) return <LoadError message={q.error.message} onRetry={q.reload} />;
  const s = q.data;
  const current = value ?? s.booksLockedUntil ?? "";
  const save = (booksLockedUntil: string | null) =>
    start(async () => {
      setErrors({});
      setMessage(null);
      setSaved(false);
      try {
        await api(`${BASE}/settings`, { method: "PUT", json: { booksLockedUntil } });
        setValue(null);
        setSaved(true);
        q.reload();
      } catch (e) {
        setMessage(saveError(e, setErrors));
      }
    });
  const lastFyEnd = prevDay(s.financialYear.from);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Close the books</CardTitle>
        <CardDescription>
          Once a period is filed or audited, close it. Nothing can then be issued, paid, refunded or posted on or before that date. Voiding still works: its reversal is dated today.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ReadOnlyNote reason={s.readOnlyReason} fallback={s.canEdit ? undefined : "Only owners and admins can close the books."} />
        {!s.configured ? <p className="text-sm text-muted-foreground">Save your company details first.</p> : null}
        <p className="text-sm">
          {s.booksLockedUntil ? (
            <>
              Books are closed up to <strong>{fmtDate(s.booksLockedUntil)}</strong>.
            </>
          ) : (
            "Books are open: any date can be used."
          )}
        </p>
        {s.canEdit && s.configured ? (
          <form
            noValidate
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              if (!current) {
                setErrors({ booksLockedUntil: "Choose the last day to close." });
                return;
              }
              save(current);
            }}
          >
            <TextField id="books-lock" label="Closed up to and including" type="date" max={s.today} value={current} onValue={setValue} error={errors.booksLockedUntil} className="sm:w-56" />
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setValue(lastFyEnd)}>
                End of {financialYearRange(lastFyEnd, s.financialYearStartMonth).label}
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? <Spinner data-icon="inline-start" /> : null}
                Close books
              </Button>
              {s.booksLockedUntil ? (
                <Button type="button" variant="ghost" disabled={pending} onClick={() => save(null)}>
                  Reopen all
                </Button>
              ) : null}
            </div>
          </form>
        ) : null}
        {message ? (
          <p role="alert" className="text-sm text-destructive">
            {message}
          </p>
        ) : saved ? (
          <p role="status" className="text-sm text-brand-green">
            Saved.
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">Financial year: {s.financialYear.label} ({fmtDate(s.financialYear.from)} to {fmtDate(s.financialYear.to)}). Change its start month in Company settings.</p>
      </CardContent>
    </Card>
  );
}
