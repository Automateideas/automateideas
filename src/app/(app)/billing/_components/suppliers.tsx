"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PencilIcon, PlusIcon, TruckIcon } from "lucide-react";

import { PhoneField } from "@/components/phone-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { api, useApiQuery } from "@/lib/api";
import { validateSupplier } from "@/lib/business-billing/contacts-validation";
import { type AddressValues, formatPaise, paiseToRupees, stateByCode } from "@/lib/business-billing/fields";
import { type Country, countries, formatPhone, parsePhone } from "@/lib/countries";

import { LoadError } from "../../_components/page-parts";
import { AddressFields, Stat, formatAddress } from "./customers";
import {
  ArchiveButton,
  ArchivedBadge,
  BackLink,
  DetailRow,
  EmptyList,
  type Errors,
  FormActions,
  ListSkeleton,
  ListToolbar,
  MoneyField,
  Pager,
  ReadOnlyNote,
  TextField,
  focusFirstError,
  saveError,
  useRecordList,
} from "./records-ui";

const API = "/api/business-billing/suppliers";

type SupplierRow = {
  id: string;
  name: string;
  displayName: string | null;
  code: string | null;
  gstin: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  openingBalancePaise: number;
  archivedAt: string | null;
};

type SupplierDetail = AddressValues & {
  id: string;
  name: string;
  displayName: string | null;
  contactPerson: string | null;
  code: string | null;
  gstin: string | null;
  pan: string | null;
  email: string | null;
  phone: string | null;
  paymentTermsDays: number | null;
  openingBalancePaise: number;
  outstandingPaise: number;
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
  notes: string | null;
  archivedAt: string | null;
  canEdit: boolean;
  readOnlyReason: string | null;
};

/* ---------------- List ---------------- */

export function SuppliersList() {
  const list = useRecordList<SupplierRow>(API);
  const { query } = list;
  const canEdit = query.data?.canEdit ?? false;
  const add = (
    <Button render={<Link href="/billing/suppliers/create" />} nativeButton={false}>
      <PlusIcon data-icon="inline-start" />
      Add supplier
    </Button>
  );

  return (
    <div className="flex flex-col gap-4">
      <ListToolbar search={list.search} onSearch={list.setSearch} placeholder="Search name, GSTIN, phone or email" status={list.status} onStatus={list.setStatus}>
        {canEdit ? add : null}
      </ListToolbar>
      {query.data && !query.data.canEdit ? <ReadOnlyNote reason={query.data.readOnlyReason} /> : null}

      {query.status === "loading" ? (
        <ListSkeleton />
      ) : !query.data ? (
        <LoadError message={query.error.message} onRetry={query.reload} />
      ) : query.data.items.length === 0 ? (
        <EmptyList
          Icon={TruckIcon}
          title="No suppliers yet"
          description="Add the businesses you buy from. You'll pick them when recording purchases."
          filtered={list.filtered}
          action={canEdit ? add : undefined}
        />
      ) : (
        <>
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Supplier</TableHead>
                  <TableHead className="hidden md:table-cell">GSTIN</TableHead>
                  <TableHead className="hidden lg:table-cell">Contact</TableHead>
                  <TableHead className="hidden sm:table-cell">Location</TableHead>
                  <TableHead className="text-right">Opening balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.items.map((s) => (
                  <TableRow key={s.id} className={s.archivedAt ? "text-muted-foreground" : undefined}>
                    <TableCell>
                      <div className="flex max-w-56 min-w-0 flex-col sm:max-w-none">
                        <Link href={`/billing/suppliers/${s.id}`} className="truncate font-medium text-foreground hover:underline">
                          {s.displayName ?? s.name}
                        </Link>
                        <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          {s.code}
                          {s.archivedAt ? <ArchivedBadge /> : null}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden font-mono text-xs md:table-cell">
                      {s.gstin ?? <span className="font-sans text-muted-foreground">Unregistered</span>}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <div className="flex flex-col text-xs">
                        <span>{s.phone}</span>
                        <span className="text-muted-foreground">{s.email}</span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-sm sm:table-cell">
                      {[s.city, s.state].filter(Boolean).join(", ") || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatPaise(s.openingBalancePaise)}</TableCell>
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

/* ---------------- Form ---------------- */

type AddressForm = { addressLine1: string; addressLine2: string; city: string; state: string; stateCode: string; postalCode: string; country: Country | null };

type FormState = {
  name: string;
  displayName: string;
  contactPerson: string;
  code: string;
  gstin: string;
  pan: string;
  email: string;
  phoneCountry: Country | null;
  phoneNumber: string;
  address: AddressForm;
  paymentTermsDays: string;
  openingBalance: string;
  bankName: string;
  bankAccountName: string;
  bankAccountNumber: string;
  bankIfsc: string;
  notes: string;
};

const india = countries.find((c) => c.code === "IN") ?? null;

function toForm(s: SupplierDetail | null): FormState {
  const phone = parsePhone(s?.phone ?? null);
  return {
    name: s?.name ?? "",
    displayName: s?.displayName ?? "",
    contactPerson: s?.contactPerson ?? "",
    code: s?.code ?? "",
    gstin: s?.gstin ?? "",
    pan: s?.pan ?? "",
    email: s?.email ?? "",
    phoneCountry: s ? phone.country : india,
    phoneNumber: phone.number,
    address: {
      addressLine1: s?.addressLine1 ?? "",
      addressLine2: s?.addressLine2 ?? "",
      city: s?.city ?? "",
      state: s?.state ?? "",
      stateCode: s?.stateCode ?? "",
      postalCode: s?.postalCode ?? "",
      country: s ? (countries.find((c) => c.code === s.countryCode) ?? null) : india,
    },
    paymentTermsDays: s?.paymentTermsDays?.toString() ?? "",
    openingBalance: s?.openingBalancePaise ? paiseToRupees(s.openingBalancePaise) : "",
    bankName: s?.bankName ?? "",
    bankAccountName: s?.bankAccountName ?? "",
    bankAccountNumber: s?.bankAccountNumber ?? "",
    bankIfsc: s?.bankIfsc ?? "",
    notes: s?.notes ?? "",
  };
}

function toPayload(f: FormState) {
  const { address: a, phoneCountry, phoneNumber, ...rest } = f;
  return {
    ...rest,
    phone: phoneNumber.trim() ? formatPhone(phoneCountry, phoneNumber) : "",
    addressLine1: a.addressLine1,
    addressLine2: a.addressLine2,
    city: a.city,
    state: a.state,
    stateCode: a.stateCode,
    postalCode: a.postalCode,
    countryCode: a.country?.code ?? "",
  };
}

// The form's address fields report errors as "address.x"; the API uses flat names.
const ADDRESS_KEYS = ["addressLine1", "addressLine2", "city", "state", "stateCode", "postalCode", "countryCode"];
const nestAddressErrors = (e: Errors): Errors =>
  Object.fromEntries(Object.entries(e).map(([k, v]) => [ADDRESS_KEYS.includes(k) ? `address.${k}` : k, v]));

export function SupplierFormPage({ id }: { id?: string }) {
  return id ? <EditSupplier id={id} /> : <SupplierForm initial={null} />;
}

function EditSupplier({ id }: { id: string }) {
  const existing = useApiQuery<SupplierDetail>(`${API}/${id}`);
  if (existing.status === "loading") return <Skeleton className="h-96 max-w-3xl rounded-xl" aria-label="Loading" />;
  if (!existing.data) return <LoadError message={existing.error.message} onRetry={existing.reload} />;
  if (!existing.data.canEdit) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink href={`/billing/suppliers/${id}`}>Back to supplier</BackLink>
        <ReadOnlyNote reason={existing.data.readOnlyReason} fallback="You can't edit suppliers. Ask an owner or admin." />
      </div>
    );
  }
  return <SupplierForm initial={existing.data} />;
}

function SupplierForm({ initial }: { initial: SupplierDetail | null }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => toForm(initial));
  const [errors, setErrorsRaw] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const setErrors = (e: Errors) => setErrorsRaw(nestAddressErrors(e));
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const backHref = initial ? `/billing/suppliers/${initial.id}` : "/billing/suppliers";
  const gstState = form.gstin.length >= 2 ? stateByCode(form.gstin.slice(0, 2)) : null;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const payload = toPayload(form);
    const local = validateSupplier(payload);
    if (!local.ok) {
      setErrors(local.errors);
      focusFirstError();
      return;
    }
    setErrors({});
    start(async () => {
      try {
        const saved = await api<SupplierDetail>(initial ? `${API}/${initial.id}` : API, { method: initial ? "PUT" : "POST", json: payload });
        router.push(`/billing/suppliers/${saved.id}`);
      } catch (err) {
        setFormError(saveError(err, setErrors));
      }
    });
  }

  return (
    <form noValidate onSubmit={onSubmit} className="flex max-w-3xl flex-col gap-6">
      <BackLink href={backHref}>{initial ? "Back to supplier" : "Back to suppliers"}</BackLink>
      <h2 className="text-lg font-semibold">{initial ? `Edit ${initial.name}` : "Add supplier"}</h2>

      <Card>
        <CardHeader>
          <CardTitle>Supplier details</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField id="s-name" label="Business name" value={form.name} onValue={(v) => set("name", v)} error={errors.name} autoComplete="off" required />
              <TextField id="s-display" label="Display name" optional value={form.displayName} onValue={(v) => set("displayName", v)} error={errors.displayName} />
              <TextField id="s-contact" label="Contact person" optional value={form.contactPerson} onValue={(v) => set("contactPerson", v)} error={errors.contactPerson} />
              <TextField id="s-code" label="Supplier code" optional value={form.code} onValue={(v) => set("code", v)} error={errors.code} />
              <TextField
                id="s-gstin"
                label="GSTIN"
                optional
                value={form.gstin}
                onValue={(v) => set("gstin", v.toUpperCase())}
                error={errors.gstin}
                maxLength={15}
                spellCheck={false}
                autoComplete="off"
                className="font-mono"
                hint={gstState ? `Registered in ${gstState.name}.` : undefined}
              />
              <TextField id="s-pan" label="PAN" optional value={form.pan} onValue={(v) => set("pan", v.toUpperCase())} error={errors.pan} maxLength={10} spellCheck={false} autoComplete="off" />
              <TextField id="s-email" label="Email" optional type="email" value={form.email} onValue={(v) => set("email", v)} error={errors.email} autoComplete="off" />
              <PhoneField
                id="s-phone"
                label="Phone (optional)"
                country={form.phoneCountry}
                onCountryChange={(c) => set("phoneCountry", c)}
                number={form.phoneNumber}
                onNumberChange={(n) => set("phoneNumber", n)}
                numberError={errors.phone}
              />
            </div>
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Address</CardTitle>
          <CardDescription>The supplier&apos;s state decides how GST on purchases is split.</CardDescription>
        </CardHeader>
        <CardContent>
          <AddressFields prefix="address" value={form.address} errors={errors} onChange={(k, v) => set("address", { ...form.address, [k]: v })} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bank and payment</CardTitle>
          <CardDescription>Used when you pay this supplier.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField id="s-bank" label="Bank name" optional value={form.bankName} onValue={(v) => set("bankName", v)} error={errors.bankName} autoComplete="off" />
              <TextField id="s-acname" label="Account holder name" optional value={form.bankAccountName} onValue={(v) => set("bankAccountName", v)} error={errors.bankAccountName} autoComplete="off" />
              <TextField
                id="s-acno"
                label="Account number"
                optional
                inputMode="numeric"
                value={form.bankAccountNumber}
                onValue={(v) => set("bankAccountNumber", v.replace(/\D/g, ""))}
                error={errors.bankAccountNumber}
                maxLength={18}
                autoComplete="off"
              />
              <TextField id="s-ifsc" label="IFSC" optional value={form.bankIfsc} onValue={(v) => set("bankIfsc", v.toUpperCase())} error={errors.bankIfsc} maxLength={11} spellCheck={false} autoComplete="off" />
              <TextField
                id="s-terms"
                label="Payment terms (days)"
                optional
                inputMode="numeric"
                value={form.paymentTermsDays}
                onValue={(v) => set("paymentTermsDays", v.replace(/\D/g, ""))}
                error={errors.paymentTermsDays}
              />
              <MoneyField
                id="s-opening"
                label="Opening balance"
                optional
                allowNegative
                value={form.openingBalance}
                onValue={(v) => set("openingBalance", v)}
                error={errors.openingBalance}
                hint="What you owed them before you started using Billing. Negative = advance paid."
              />
            </div>
            <Field data-invalid={!!errors.notes}>
              <FieldLabel htmlFor="s-notes">
                Notes <span className="font-normal text-muted-foreground">(optional)</span>
              </FieldLabel>
              <Textarea id="s-notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={3} aria-invalid={!!errors.notes} />
              <FieldDescription>Only your team sees these.</FieldDescription>
              <FieldError>{errors.notes}</FieldError>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      <FormActions pending={pending} submitLabel={initial ? "Save changes" : "Add supplier"} cancelHref={backHref} error={formError} />
    </form>
  );
}

/* ---------------- Detail ---------------- */

const maskAccount = (n: string) => (n.length > 4 ? `${"•".repeat(Math.min(8, n.length - 4))}${n.slice(-4)}` : n);

export function SupplierDetailView({ id }: { id: string }) {
  const query = useApiQuery<SupplierDetail>(`${API}/${id}`);
  const [showAccount, setShowAccount] = useState(false);
  if (query.status === "loading") return <Skeleton className="h-96 max-w-4xl rounded-xl" aria-label="Loading" />;
  if (!query.data) return <LoadError message={query.error.message} onRetry={query.reload} />;
  const s = query.data;
  const address = formatAddress(s);

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <BackLink href="/billing/suppliers">Back to suppliers</BackLink>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
            {s.displayName ?? s.name}
            {s.archivedAt ? <ArchivedBadge /> : null}
          </h2>
          <p>
            <Badge variant="outline">{s.gstin ? "GST registered" : "Unregistered"}</Badge>
          </p>
        </div>
        {s.canEdit ? (
          <div className="flex gap-2">
            {s.archivedAt ? null : (
              <Button render={<Link href={`/billing/suppliers/${s.id}/edit`} />} nativeButton={false}>
                <PencilIcon data-icon="inline-start" />
                Edit
              </Button>
            )}
            <ArchiveButton
              endpoint={`${API}/${s.id}`}
              archived={!!s.archivedAt}
              name={s.name}
              kind="supplier"
              consequence="They won't appear in lists or when recording purchases. Their bills and payments stay."
              onDone={query.reload}
            />
          </div>
        ) : null}
      </div>
      {!s.canEdit ? <ReadOnlyNote reason={s.readOnlyReason} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Stat label="You owe" value={formatPaise(s.outstandingPaise)} />
        <Stat label="Payment terms" value={s.paymentTermsDays === null ? "Not set" : `${s.paymentTermsDays} days`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="divide-y">
            <DetailRow label="Legal name">{s.name}</DetailRow>
            <DetailRow label="Contact person">{s.contactPerson}</DetailRow>
            <DetailRow label="Supplier code">{s.code}</DetailRow>
            <DetailRow label="GSTIN">{s.gstin ? <span className="font-mono">{s.gstin}</span> : null}</DetailRow>
            <DetailRow label="PAN">{s.pan ? <span className="font-mono">{s.pan}</span> : null}</DetailRow>
            <DetailRow label="Email">{s.email ? <a className="hover:underline" href={`mailto:${s.email}`}>{s.email}</a> : null}</DetailRow>
            <DetailRow label="Phone">{s.phone}</DetailRow>
            <DetailRow label="Address">{address ? <span className="whitespace-pre-line">{address}</span> : null}</DetailRow>
            <DetailRow label="Bank">{[s.bankName, s.bankAccountName].filter(Boolean).join(" · ")}</DetailRow>
            <DetailRow label="Account number">
              {s.bankAccountNumber ? (
                <span className="flex items-center gap-2">
                  <span className="font-mono">{showAccount ? s.bankAccountNumber : maskAccount(s.bankAccountNumber)}</span>
                  <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setShowAccount((v) => !v)}>
                    {showAccount ? "Hide" : "Show"}
                  </Button>
                </span>
              ) : null}
            </DetailRow>
            <DetailRow label="IFSC">{s.bankIfsc ? <span className="font-mono">{s.bankIfsc}</span> : null}</DetailRow>
            <DetailRow label="Notes">{s.notes ? <span className="whitespace-pre-line">{s.notes}</span> : null}</DetailRow>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Purchases and payments</CardTitle>
          <CardDescription>Bills, payments and the supplier ledger appear here once purchases are available.</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
