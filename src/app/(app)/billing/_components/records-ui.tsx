"use client";

// Building blocks shared by the customers, suppliers and catalogue pages.

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { ArchiveIcon, ArchiveRestoreIcon, ChevronLeftIcon, ChevronRightIcon, LockIcon, SearchIcon, type LucideIcon } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ApiError, api, useApiQuery } from "@/lib/api";
import { INDIAN_STATES } from "@/lib/business-billing/fields";
import { gstRatesOn } from "@/lib/business-billing/tax/rates";
import { cn } from "@/lib/utils";

/* ---------------- Lists ---------------- */

export type ListStatus = "active" | "archived" | "all";
export type Paged<T> = { items: T[]; total: number; page: number; pageSize: number; canEdit: boolean; readOnlyReason: string | null };

/** Search, status filter and paging for a list endpoint. Search waits 300 ms after typing. */
export function useRecordList<T>(endpoint: string, extra: Record<string, string | null> = {}) {
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatusState] = useState<ListStatus>("active");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const params = new URLSearchParams({ status, page: String(page) });
  if (q) params.set("q", q);
  for (const [k, v] of Object.entries(extra)) if (v) params.set(k, v);
  const query = useApiQuery<Paged<T>>(`${endpoint}?${params}`);

  return {
    query,
    search,
    setSearch,
    status,
    setStatus: (s: ListStatus) => {
      setStatusState(s);
      setPage(1);
    },
    page,
    setPage,
    filtered: !!q || status !== "active",
  };
}

const STATUS_ITEMS = [
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
  { value: "all", label: "All" },
];

export function ListToolbar({
  search,
  onSearch,
  placeholder,
  status,
  onStatus,
  children,
}: {
  search: string;
  onSearch: (v: string) => void;
  placeholder: string;
  status?: ListStatus;
  onStatus?: (s: ListStatus) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <InputGroup className="h-10 sm:max-w-sm">
        <InputGroupAddon>
          <SearchIcon aria-hidden="true" />
        </InputGroupAddon>
        <InputGroupInput
          type="search"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
        />
      </InputGroup>
      {status && onStatus ? (
        <Select items={STATUS_ITEMS} value={status} onValueChange={(v) => v && onStatus(v as ListStatus)}>
          <SelectTrigger className="h-10 w-full sm:w-36" aria-label="Show">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_ITEMS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      {children ? <div className="flex gap-2 sm:ml-auto">{children}</div> : null}
    </div>
  );
}

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav aria-label="Pages" className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
      <span>
        {from}–{to} of {total}
      </span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={() => onPage(page - 1)} disabled={page <= 1}>
          <ChevronLeftIcon data-icon="inline-start" />
          Previous
        </Button>
        <Button variant="outline" size="sm" onClick={() => onPage(page + 1)} disabled={page >= pages}>
          Next
          <ChevronRightIcon data-icon="inline-end" />
        </Button>
      </div>
    </nav>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-12 rounded-lg" />
      ))}
    </div>
  );
}

/** Empty list: either nothing yet (with an add action) or nothing matching the filters. */
export function EmptyList({
  Icon,
  title,
  description,
  filtered,
  action,
}: {
  Icon: LucideIcon;
  title: string;
  description: string;
  filtered: boolean;
  action?: React.ReactNode;
}) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon />
        </EmptyMedia>
        <EmptyTitle>{filtered ? "Nothing matches" : title}</EmptyTitle>
        <EmptyDescription>{filtered ? "Try a different search, or show archived records too." : description}</EmptyDescription>
      </EmptyHeader>
      {!filtered && action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  );
}

export const ArchivedBadge = () => <Badge variant="secondary">Archived</Badge>;

/** Why editing is off: the workspace is read-only, or the member lacks permission. */
export function ReadOnlyNote({ reason, fallback }: { reason: string | null; fallback?: string }) {
  const text = reason ?? fallback;
  if (!text) return null;
  return (
    <Alert>
      <LockIcon />
      <AlertDescription>{text}</AlertDescription>
    </Alert>
  );
}

/* ---------------- Archive / restore ---------------- */

/** Archive (with a confirmation) or restore a record via POST {endpoint}/archive. */
export function ArchiveButton({
  endpoint,
  archived,
  name,
  kind,
  consequence,
  onDone,
  size = "default",
}: {
  endpoint: string;
  archived: boolean;
  name: string;
  kind: string;
  consequence: string;
  onDone: () => void;
  size?: "default" | "sm";
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (next: boolean) =>
    start(async () => {
      setError(null);
      try {
        await api(`${endpoint}/archive`, { method: "POST", json: { archived: next } });
        setOpen(false);
        onDone();
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Something went wrong. Try again.");
      }
    });

  if (archived) {
    return (
      <div className="flex flex-col items-start gap-1">
        <Button variant="outline" size={size} onClick={() => run(false)} disabled={pending}>
          {pending ? <Spinner data-icon="inline-start" /> : <ArchiveRestoreIcon data-icon="inline-start" />}
          Restore
        </Button>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      </div>
    );
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next: boolean) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <AlertDialogTrigger render={<Button variant="outline" size={size} />}>
        <ArchiveIcon data-icon="inline-start" />
        Archive
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            {consequence} Nothing is deleted, and you can restore this {kind} any time.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => run(true)} disabled={pending}>
            {pending ? <Spinner data-icon="inline-start" /> : null}
            Archive
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/* ---------------- Form fields ---------------- */

export type Errors = Record<string, string | undefined>;

/** Focus the first invalid field after a failed submit. */
export const focusFirstError = () =>
  requestAnimationFrame(() => document.querySelector<HTMLElement>("[aria-invalid=true]")?.focus());

/** Message for a failed save; field errors are shown next to their fields. */
export function saveError(e: unknown, setErrors: (e: Errors) => void) {
  if (e instanceof ApiError) {
    if (e.fields) {
      setErrors(e.fields);
      focusFirstError();
    }
    return e.message;
  }
  return "Something went wrong. Try again.";
}

type TextProps = Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "id"> & {
  id: string;
  label: string;
  value: string;
  onValue: (v: string) => void;
  error?: string;
  hint?: React.ReactNode;
  optional?: boolean;
};

export function TextField({ id, label, value, onValue, error, hint, optional, className, ...rest }: TextProps) {
  return (
    <Field data-invalid={!!error} className={className}>
      <FieldLabel htmlFor={id}>
        {label}
        {optional ? <span className="font-normal text-muted-foreground">(optional)</span> : null}
      </FieldLabel>
      <Input id={id} value={value} onChange={(e) => onValue(e.target.value)} aria-invalid={!!error} {...rest} />
      {error ? <FieldError>{error}</FieldError> : hint ? <FieldDescription>{hint}</FieldDescription> : null}
    </Field>
  );
}

/** Rupee amount input with a ₹ prefix. Value is the typed string. */
export function MoneyField({
  id,
  label,
  value,
  onValue,
  error,
  hint,
  optional,
  disabled,
  allowNegative,
}: Omit<TextProps, "type"> & { allowNegative?: boolean }) {
  return (
    <Field data-invalid={!!error}>
      <FieldLabel htmlFor={id}>
        {label}
        {optional ? <span className="font-normal text-muted-foreground">(optional)</span> : null}
      </FieldLabel>
      <InputGroup>
        <InputGroupAddon>
          <InputGroupText>₹</InputGroupText>
        </InputGroupAddon>
        <InputGroupInput
          id={id}
          inputMode="decimal"
          value={value}
          onChange={(e) => onValue(e.target.value.replace(allowNegative ? /[^\d.,-]/g : /[^\d.,]/g, ""))}
          placeholder="0.00"
          aria-invalid={!!error}
          disabled={disabled}
          className="tabular-nums"
        />
      </InputGroup>
      {error ? <FieldError>{error}</FieldError> : hint ? <FieldDescription>{hint}</FieldDescription> : null}
    </Field>
  );
}

type Option = { value: string; label: string };

/** A labelled Select. `""` means none chosen (shown as the placeholder). */
export function SelectField({
  id,
  label,
  value,
  onValue,
  options,
  placeholder = "Choose…",
  error,
  hint,
  optional,
  disabled,
  noneLabel,
  className,
}: {
  id: string;
  label: string;
  value: string;
  onValue: (v: string) => void;
  options: readonly Option[];
  placeholder?: string;
  error?: string;
  hint?: React.ReactNode;
  optional?: boolean;
  disabled?: boolean;
  /** Adds a first option that clears the value, e.g. "No category". */
  noneLabel?: string;
  className?: string;
}) {
  const NONE = "__none__";
  const items = noneLabel ? [{ value: NONE, label: noneLabel }, ...options] : options;
  return (
    <Field data-invalid={!!error} className={className}>
      <FieldLabel htmlFor={id}>
        {label}
        {optional ? <span className="font-normal text-muted-foreground">(optional)</span> : null}
      </FieldLabel>
      <Select
        items={items}
        value={value || (noneLabel ? NONE : null)}
        onValueChange={(v) => onValue(!v || v === NONE ? "" : String(v))}
        disabled={disabled}
      >
        <SelectTrigger id={id} className="h-9 w-full" aria-invalid={!!error}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {items.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error ? <FieldError>{error}</FieldError> : hint ? <FieldDescription>{hint}</FieldDescription> : null}
    </Field>
  );
}

export const STATE_OPTIONS: Option[] = INDIAN_STATES.map((s) => ({ value: s.code, label: `${s.name} (${s.code})` }));

// Slabs in force today; the rate saved on each item is what gets charged.
const RATE_OPTIONS: Option[] = gstRatesOn().map((r) => ({ value: r, label: `${r}%` }));

/** GST rate picker: the standard slabs, plus the current value if it's non-standard. */
export function TaxRateField({ id, value, onValue, error, disabled, label = "GST rate" }: { id: string; value: string; onValue: (v: string) => void; error?: string; disabled?: boolean; label?: string }) {
  const options = RATE_OPTIONS.some((o) => o.value === value) || !value ? RATE_OPTIONS : [...RATE_OPTIONS, { value, label: `${value}%` }];
  return <SelectField id={id} label={label} value={value} onValue={onValue} options={options} error={error} disabled={disabled} />;
}

/** Strips trailing zeros from a numeric string from the API: "18.0000" → "18". */
export const cleanDecimal = (v: string | null | undefined) => (v ? (v.includes(".") ? v.replace(/\.?0+$/, "") : v) : "");

/** Save / cancel row at the end of a form. */
export function FormActions({
  pending,
  submitLabel,
  cancelHref,
  error,
  className,
}: {
  pending: boolean;
  submitLabel: string;
  cancelHref: string;
  error: string | null;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-center", className)}>
      <Button type="submit" disabled={pending}>
        {pending ? <Spinner data-icon="inline-start" /> : null}
        {submitLabel}
      </Button>
      <Button variant="ghost" render={<Link href={cancelHref} />} nativeButton={false}>
        Cancel
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** A label/value row on detail pages. Hidden when empty unless `always`. */
export function DetailRow({ label, children, always }: { label: string; children: React.ReactNode; always?: boolean }) {
  if (!always && (children === null || children === undefined || children === "")) return null;
  return (
    <div className="grid gap-1 py-2.5 sm:grid-cols-3 sm:gap-4">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm sm:col-span-2">{children || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );
}

/** "Back to X" link above detail and form pages. */
export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ChevronLeftIcon className="size-4" aria-hidden="true" />
      {children}
    </Link>
  );
}
