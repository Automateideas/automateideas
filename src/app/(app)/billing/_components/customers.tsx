"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PencilIcon, PlusIcon, UsersIcon } from "lucide-react";

import { PhoneField, phoneError } from "@/components/phone-field";
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ApiError, api, useApiQuery } from "@/lib/api";
import { type CustomerType, validateCustomer } from "@/lib/business-billing/contacts-validation";
import { cleanGstin, cleanPan, cleanPostalCode } from "@/lib/business-billing/input-limits";
import { type AddressValues, formatPaise, paiseToRupees, stateByCode } from "@/lib/business-billing/fields";
import { type Country, countries, formatPhone, parsePhone } from "@/lib/countries";

import { LoadError } from "../../_components/page-parts";
import { CustomerAccount } from "./payments";
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
  STATE_OPTIONS,
  SelectField,
  TextField,
  focusFirstError,
  saveError,
  useRecordList,
} from "./records-ui";

const API = "/api/business-billing/customers";

type CustomerRow = {
  id: string;
  name: string;
  displayName: string | null;
  customerType: CustomerType;
  code: string | null;
  gstin: string | null;
  email: string | null;
  phone: string | null;
  category: string | null;
  openingBalancePaise: number;
  archivedAt: string | null;
  address: { city: string | null; state: string | null } | null;
};

type CustomerDetail = {
  id: string;
  customerType: CustomerType;
  name: string;
  displayName: string | null;
  contactPerson: string | null;
  code: string | null;
  category: string | null;
  gstin: string | null;
  pan: string | null;
  email: string | null;
  phone: string | null;
  placeOfSupply: string | null;
  paymentTermsDays: number | null;
  creditLimitPaise: number | null;
  openingBalancePaise: number;
  outstandingPaise: number;
  priceListId: string | null;
  priceListName: string | null;
  notes: string | null;
  billingAddress: AddressValues | null;
  shippingAddress: AddressValues | null;
  archivedAt: string | null;
  updatedAt: string;
  canEdit: boolean;
  readOnlyReason: string | null;
};

const TYPE_LABEL: Record<CustomerType, string> = { business: "Business", individual: "Individual" };

/* ---------------- List ---------------- */

export function CustomersList() {
  const list = useRecordList<CustomerRow>(API);
  const { query } = list;
  const canEdit = query.data?.canEdit ?? false;
  const add = (
    <Button render={<Link href="/billing/customers/create" />} nativeButton={false}>
      <PlusIcon data-icon="inline-start" />
      Add customer
    </Button>
  );

  return (
    <div className="flex flex-col gap-4">
      <ListToolbar
        search={list.search}
        onSearch={list.setSearch}
        placeholder="Search name, GSTIN, phone or email"
        status={list.status}
        onStatus={list.setStatus}
      >
        {canEdit ? add : null}
      </ListToolbar>
      {query.data && !query.data.canEdit ? <ReadOnlyNote reason={query.data.readOnlyReason} /> : null}

      {query.status === "loading" ? (
        <ListSkeleton />
      ) : !query.data ? (
        <LoadError message={query.error.message} onRetry={query.reload} />
      ) : query.data.items.length === 0 ? (
        <EmptyList
          Icon={UsersIcon}
          title="No customers yet"
          description="Add the people and businesses you bill. You'll pick them when creating invoices."
          filtered={list.filtered}
          action={canEdit ? add : undefined}
        />
      ) : (
        <>
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead className="hidden md:table-cell">GSTIN</TableHead>
                  <TableHead className="hidden lg:table-cell">Contact</TableHead>
                  <TableHead className="hidden sm:table-cell">Location</TableHead>
                  <TableHead className="text-right">Opening balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.items.map((c) => (
                  <TableRow key={c.id} className={c.archivedAt ? "text-muted-foreground" : undefined}>
                    <TableCell>
                      <div className="flex max-w-56 min-w-0 flex-col sm:max-w-none">
                        <Link href={`/billing/customers/${c.id}`} className="truncate font-medium text-foreground hover:underline">
                          {c.displayName ?? c.name}
                        </Link>
                        <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          {TYPE_LABEL[c.customerType]}
                          {c.code ? <span>· {c.code}</span> : null}
                          {c.category ? <span>· {c.category}</span> : null}
                          {c.archivedAt ? <ArchivedBadge /> : null}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden font-mono text-xs md:table-cell">
                      {c.gstin ?? <span className="font-sans text-muted-foreground">Unregistered</span>}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <div className="flex flex-col text-xs">
                        <span>{c.phone}</span>
                        <span className="text-muted-foreground">{c.email}</span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-sm sm:table-cell">
                      {[c.address?.city, c.address?.state].filter(Boolean).join(", ") || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatPaise(c.openingBalancePaise)}</TableCell>
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
  customerType: CustomerType;
  name: string;
  displayName: string;
  contactPerson: string;
  code: string;
  category: string;
  gstin: string;
  pan: string;
  email: string;
  phoneCountry: Country | null;
  phoneNumber: string;
  paymentTermsDays: string;
  creditLimit: string;
  openingBalance: string;
  priceListId: string;
  notes: string;
  billing: AddressForm;
  sameShipping: boolean;
  shipping: AddressForm;
};

const india = countries.find((c) => c.code === "IN") ?? null;

function addressForm(a: AddressValues | null): AddressForm {
  return {
    addressLine1: a?.addressLine1 ?? "",
    addressLine2: a?.addressLine2 ?? "",
    city: a?.city ?? "",
    state: a?.state ?? "",
    stateCode: a?.stateCode ?? "",
    postalCode: a?.postalCode ?? "",
    country: a ? (countries.find((c) => c.code === a.countryCode) ?? null) : india,
  };
}

function toForm(c: CustomerDetail | null): FormState {
  const phone = parsePhone(c?.phone ?? null);
  return {
    customerType: c?.customerType ?? "business",
    name: c?.name ?? "",
    displayName: c?.displayName ?? "",
    contactPerson: c?.contactPerson ?? "",
    code: c?.code ?? "",
    category: c?.category ?? "",
    gstin: c?.gstin ?? "",
    pan: c?.pan ?? "",
    email: c?.email ?? "",
    phoneCountry: c ? phone.country : india,
    phoneNumber: phone.number,
    paymentTermsDays: c?.paymentTermsDays?.toString() ?? "",
    creditLimit: c?.creditLimitPaise === null || c?.creditLimitPaise === undefined ? "" : paiseToRupees(c.creditLimitPaise),
    openingBalance: c?.openingBalancePaise ? paiseToRupees(c.openingBalancePaise) : "",
    priceListId: c?.priceListId ?? "",
    notes: c?.notes ?? "",
    billing: addressForm(c?.billingAddress ?? null),
    sameShipping: !c?.shippingAddress,
    shipping: addressForm(c?.shippingAddress ?? null),
  };
}

const addressPayload = (a: AddressForm) => ({
  addressLine1: a.addressLine1,
  addressLine2: a.addressLine2,
  city: a.city,
  state: a.state,
  stateCode: a.stateCode,
  postalCode: a.postalCode,
  countryCode: a.country?.code ?? "",
});

function toPayload(f: FormState) {
  return {
    customerType: f.customerType,
    name: f.name,
    displayName: f.displayName,
    contactPerson: f.contactPerson,
    code: f.code,
    category: f.category,
    gstin: f.gstin,
    pan: f.pan,
    email: f.email,
    phone: f.phoneNumber.trim() ? formatPhone(f.phoneCountry, f.phoneNumber) : "",
    paymentTermsDays: f.paymentTermsDays,
    creditLimit: f.creditLimit,
    openingBalance: f.openingBalance,
    priceListId: f.priceListId || null,
    notes: f.notes,
    billingAddress: addressPayload(f.billing),
    shippingAddress: f.sameShipping ? null : addressPayload(f.shipping),
  };
}

type Duplicate = { id: string; name: string; reason: string };

/** /billing/customers/create and /billing/customers/:id/edit. */
export function CustomerFormPage({ id }: { id?: string }) {
  return id ? <EditCustomer id={id} /> : <CustomerForm initial={null} />;
}

function EditCustomer({ id }: { id: string }) {
  const existing = useApiQuery<CustomerDetail>(`${API}/${id}`);
  if (existing.status === "loading") return <FormSkeleton />;
  if (!existing.data) return <LoadError message={existing.error.message} onRetry={existing.reload} />;
  if (!existing.data.canEdit) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink href={`/billing/customers/${id}`}>Back to customer</BackLink>
        <ReadOnlyNote reason={existing.data.readOnlyReason} fallback="You can't edit customers. Ask an owner or admin." />
      </div>
    );
  }
  return <CustomerForm initial={existing.data} />;
}

function CustomerForm({ initial }: { initial: CustomerDetail | null }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => toForm(initial));
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [duplicates, setDuplicates] = useState<Duplicate[] | null>(null);
  const [pending, start] = useTransition();
  const priceLists = useApiQuery<{ items: { id: string; name: string; isDefault: boolean }[] }>("/api/business-billing/price-lists");
  const categories = useApiQuery<{ categories: string[] }>(`${API}/categories`);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setDuplicates(null);
  };
  const setAddr = (which: "billing" | "shipping", key: keyof AddressForm, value: AddressForm[keyof AddressForm]) =>
    setForm((f) => ({ ...f, [which]: { ...f[which], [key]: value } }));

  const backHref = initial ? `/billing/customers/${initial.id}` : "/billing/customers";
  const gstState = form.gstin.length >= 2 ? stateByCode(form.gstin.slice(0, 2)) : null;

  function save(allowDuplicate: boolean) {
    setFormError(null);
    const payload = toPayload(form);
    const local = validateCustomer(payload);
    // Optional phone; when given it must fit its country (10 digits for India).
    const phoneProblem = form.phoneNumber.trim() ? phoneError(form.phoneCountry, form.phoneNumber) : null;
    if (!local.ok || phoneProblem) {
      setErrors({ ...(local.ok ? {} : local.errors), ...(phoneProblem ? { phone: phoneProblem } : {}) });
      focusFirstError();
      return;
    }
    setErrors({});
    start(async () => {
      try {
        const saved = await api<CustomerDetail>(initial ? `${API}/${initial.id}` : API, {
          method: initial ? "PUT" : "POST",
          json: { ...payload, allowDuplicate },
        });
        router.push(`/billing/customers/${saved.id}`);
      } catch (e) {
        if (e instanceof ApiError && e.code === "POSSIBLE_DUPLICATE") {
          setDuplicates((e.details as { matches: Duplicate[] }).matches);
          return;
        }
        setFormError(saveError(e, setErrors));
      }
    });
  }

  const priceListOptions = (priceLists.data?.items ?? []).map((p) => ({ value: p.id, label: p.isDefault ? `${p.name} (default)` : p.name }));
  // Keep showing the current price list even if it's been archived since.
  if (initial?.priceListId && !priceListOptions.some((o) => o.value === initial.priceListId)) {
    priceListOptions.push({ value: initial.priceListId, label: `${initial.priceListName ?? "Price list"} (archived)` });
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save(false);
      }}
      className="flex max-w-3xl flex-col gap-6"
    >
      <BackLink href={backHref}>{initial ? "Back to customer" : "Back to customers"}</BackLink>
      <h2 className="text-lg font-semibold">{initial ? `Edit ${initial.name}` : "Add customer"}</h2>

      <Card>
        <CardHeader>
          <CardTitle>Customer details</CardTitle>
          <CardDescription>The name and GSTIN appear on invoices.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel id="c-type-label">Type</FieldLabel>
              <ToggleGroup
                aria-labelledby="c-type-label"
                variant="outline"
                value={[form.customerType]}
                onValueChange={(v: string[]) => v[0] && set("customerType", v[0] as CustomerType)}
                className="w-fit"
              >
                <ToggleGroupItem value="business">Business</ToggleGroupItem>
                <ToggleGroupItem value="individual">Individual</ToggleGroupItem>
              </ToggleGroup>
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField
                id="c-name"
                label={form.customerType === "business" ? "Business name" : "Full name"}
                value={form.name}
                onValue={(v) => set("name", v)}
                error={errors.name}
                autoComplete="off"
                required
              />
              <TextField id="c-display" label="Display name" optional value={form.displayName} onValue={(v) => set("displayName", v)} error={errors.displayName} hint="A short name for lists, if different." />
              {form.customerType === "business" ? (
                <TextField id="c-contact" label="Contact person" optional value={form.contactPerson} onValue={(v) => set("contactPerson", v)} error={errors.contactPerson} />
              ) : null}
              <TextField id="c-code" label="Customer code" optional value={form.code} onValue={(v) => set("code", v)} error={errors.code} hint="Your own reference, e.g. C-101." />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField
                id="c-gstin"
                label="GSTIN"
                optional
                value={form.gstin}
                onValue={(v) => set("gstin", cleanGstin(v))}
                error={errors.gstin}
                spellCheck={false}
                autoComplete="off"
                className="font-mono"
                hint={gstState ? `Registered in ${gstState.name}.` : "Leave blank for unregistered customers."}
              />
              <TextField id="c-pan" label="PAN" optional value={form.pan} onValue={(v) => set("pan", cleanPan(v))} error={errors.pan} spellCheck={false} autoComplete="off" />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField id="c-email" label="Email" optional type="email" value={form.email} onValue={(v) => set("email", v)} error={errors.email} autoComplete="off" />
              <PhoneField
                id="c-phone"
                label="Mobile number (optional)"
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

      <AddressCard title="Billing address" prefix="billingAddress" value={form.billing} errors={errors} onChange={(k, v) => setAddr("billing", k, v)} />

      <Card>
        <CardHeader>
          <CardTitle>Shipping address</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <Field orientation="horizontal">
            <Checkbox id="c-same" checked={form.sameShipping} onCheckedChange={(c) => set("sameShipping", c === true)} />
            <FieldLabel htmlFor="c-same" className="font-normal">
              Same as billing address
            </FieldLabel>
          </Field>
          {form.sameShipping ? null : (
            <AddressFields prefix="shippingAddress" value={form.shipping} errors={errors} onChange={(k, v) => setAddr("shipping", k, v)} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payment and pricing</CardTitle>
          <CardDescription>Defaults used when you bill this customer.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField
                id="c-terms"
                label="Payment terms (days)"
                optional
                inputMode="numeric"
                value={form.paymentTermsDays}
                onValue={(v) => set("paymentTermsDays", v.replace(/\D/g, ""))}
                error={errors.paymentTermsDays}
                hint="Invoice due date = issue date + these days."
              />
              <MoneyField id="c-credit" label="Credit limit" optional value={form.creditLimit} onValue={(v) => set("creditLimit", v)} error={errors.creditLimit} />
              <MoneyField
                id="c-opening"
                label="Opening balance"
                optional
                allowNegative
                value={form.openingBalance}
                onValue={(v) => set("openingBalance", v)}
                error={errors.openingBalance}
                hint="What they owed you before you started using Billing. Negative = advance received."
              />
              <SelectField
                id="c-pricelist"
                label="Price list"
                optional
                value={form.priceListId}
                onValue={(v) => set("priceListId", v)}
                options={priceListOptions}
                noneLabel="Standard prices"
                error={errors.priceListId}
              />
            </div>
            <Field data-invalid={!!errors.category}>
              <FieldLabel htmlFor="c-category">
                Category <span className="font-normal text-muted-foreground">(optional)</span>
              </FieldLabel>
              <input
                id="c-category"
                list="c-category-list"
                value={form.category}
                onChange={(e) => set("category", e.target.value)}
                aria-invalid={!!errors.category}
                placeholder="e.g. Wholesale, Retail, Distributor"
                className="h-9 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive sm:max-w-xs dark:bg-input/30"
              />
              <datalist id="c-category-list">
                {(categories.data?.categories ?? []).map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <FieldError>{errors.category}</FieldError>
            </Field>
            <Field data-invalid={!!errors.notes}>
              <FieldLabel htmlFor="c-notes">
                Notes <span className="font-normal text-muted-foreground">(optional)</span>
              </FieldLabel>
              <Textarea id="c-notes" value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={3} aria-invalid={!!errors.notes} />
              <FieldDescription>Only your team sees these.</FieldDescription>
              <FieldError>{errors.notes}</FieldError>
            </Field>
          </FieldGroup>
        </CardContent>
      </Card>

      {duplicates ? (
        <Alert>
          <UsersIcon />
          <AlertTitle>This customer may already exist</AlertTitle>
          <AlertDescription>
            <ul className="mt-1 list-disc pl-4">
              {duplicates.map((d) => (
                <li key={d.id}>
                  <Link href={`/billing/customers/${d.id}`} className="font-medium underline underline-offset-2" target="_blank">
                    {d.name}
                  </Link>{" "}
                  ({d.reason})
                </li>
              ))}
            </ul>
          </AlertDescription>
          <AlertAction>
            <Button size="sm" variant="outline" type="button" onClick={() => save(true)} disabled={pending}>
              Save anyway
            </Button>
          </AlertAction>
        </Alert>
      ) : null}

      <FormActions pending={pending} submitLabel={initial ? "Save changes" : "Add customer"} cancelHref={backHref} error={formError} />
    </form>
  );
}

function AddressCard(props: { title: string } & AddressFieldsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{props.title}</CardTitle>
        <CardDescription>In India, the state decides CGST + SGST or IGST.</CardDescription>
      </CardHeader>
      <CardContent>
        <AddressFields {...props} />
      </CardContent>
    </Card>
  );
}

type AddressFieldsProps = {
  prefix: string;
  value: AddressForm;
  errors: Errors;
  onChange: (key: keyof AddressForm, value: AddressForm[keyof AddressForm]) => void;
};

export function AddressFields({ prefix, value, errors, onChange }: AddressFieldsProps) {
  const e = (k: string) => errors[`${prefix}.${k}`];
  const inIndia = value.country?.code === "IN";
  const countryOptions = countries.map((c) => ({ value: c.code, label: c.label }));
  return (
    <FieldGroup>
      <TextField id={`${prefix}-l1`} label="Address line 1" optional value={value.addressLine1} onValue={(v) => onChange("addressLine1", v)} error={e("addressLine1")} autoComplete="off" />
      <TextField id={`${prefix}-l2`} label="Address line 2" optional value={value.addressLine2} onValue={(v) => onChange("addressLine2", v)} error={e("addressLine2")} autoComplete="off" />
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField id={`${prefix}-city`} label="City" optional value={value.city} onValue={(v) => onChange("city", v)} error={e("city")} autoComplete="off" />
        {inIndia ? (
          <SelectField id={`${prefix}-state`} label="State" optional value={value.stateCode} onValue={(v) => onChange("stateCode", v)} options={STATE_OPTIONS} placeholder="Choose a state" error={e("stateCode")} />
        ) : (
          <TextField id={`${prefix}-state`} label="State / region" optional value={value.state} onValue={(v) => onChange("state", v)} error={e("state")} autoComplete="off" />
        )}
        <TextField
          id={`${prefix}-pin`}
          label={inIndia ? "PIN code" : "Postal code"}
          optional
          inputMode={inIndia ? "numeric" : undefined}
          value={value.postalCode}
          onValue={(v) => onChange("postalCode", cleanPostalCode(v, value.country?.code))}
          error={e("postalCode")}
          autoComplete="off"
        />
        <SelectField
          id={`${prefix}-country`}
          label="Country"
          value={value.country?.code ?? ""}
          onValue={(code) => onChange("country", countries.find((c) => c.code === code) ?? null)}
          options={countryOptions}
          error={e("countryCode")}
        />
      </div>
    </FieldGroup>
  );
}

function FormSkeleton() {
  return (
    <div className="flex max-w-3xl flex-col gap-6" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-80 rounded-xl" />
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}

/* ---------------- Detail ---------------- */

export function formatAddress(a: AddressValues | null) {
  if (!a) return null;
  const country = a.countryCode === "IN" ? null : countries.find((c) => c.code === a.countryCode)?.label;
  const parts = [a.addressLine1, a.addressLine2, [a.city, a.state].filter(Boolean).join(", "), a.postalCode, country].filter(Boolean);
  return parts.length ? parts.join("\n") : null;
}

export function CustomerDetailView({ id }: { id: string }) {
  const query = useApiQuery<CustomerDetail>(`${API}/${id}`);
  if (query.status === "loading") return <FormSkeleton />;
  if (!query.data) return <LoadError message={query.error.message} onRetry={query.reload} />;
  const c = query.data;
  const pos = stateByCode(c.placeOfSupply);
  const billing = formatAddress(c.billingAddress);
  const shipping = formatAddress(c.shippingAddress);

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <BackLink href="/billing/customers">Back to customers</BackLink>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
            {c.displayName ?? c.name}
            {c.archivedAt ? <ArchivedBadge /> : null}
          </h2>
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline">{TYPE_LABEL[c.customerType]}</Badge>
            <Badge variant="outline">{c.gstin ? "GST registered" : "Unregistered"}</Badge>
            {c.category ? <Badge variant="outline">{c.category}</Badge> : null}
          </p>
        </div>
        {c.canEdit ? (
          <div className="flex gap-2">
            {c.archivedAt ? null : (
              <Button render={<Link href={`/billing/customers/${c.id}/edit`} />} nativeButton={false}>
                <PencilIcon data-icon="inline-start" />
                Edit
              </Button>
            )}
            <ArchiveButton
              endpoint={`${API}/${c.id}`}
              archived={!!c.archivedAt}
              name={c.name}
              kind="customer"
              consequence="They won't appear in lists or when creating invoices. Their invoices and payments stay."
              onDone={query.reload}
            />
          </div>
        ) : null}
      </div>
      {!c.canEdit ? <ReadOnlyNote reason={c.readOnlyReason} /> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Outstanding" value={formatPaise(c.outstandingPaise)} />
        <Stat label="Credit limit" value={c.creditLimitPaise === null ? "No limit" : formatPaise(c.creditLimitPaise)} />
        <Stat label="Payment terms" value={c.paymentTermsDays === null ? "Not set" : c.paymentTermsDays === 0 ? "Due on receipt" : `${c.paymentTermsDays} days`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="divide-y">
            <DetailRow label="Legal name">{c.name}</DetailRow>
            <DetailRow label="Contact person">{c.contactPerson}</DetailRow>
            <DetailRow label="Customer code">{c.code}</DetailRow>
            <DetailRow label="GSTIN">{c.gstin ? <span className="font-mono">{c.gstin}</span> : null}</DetailRow>
            <DetailRow label="PAN">{c.pan ? <span className="font-mono">{c.pan}</span> : null}</DetailRow>
            <DetailRow label="Place of supply">{pos ? `${pos.name} (${pos.code})` : null}</DetailRow>
            <DetailRow label="Email">{c.email ? <a className="hover:underline" href={`mailto:${c.email}`}>{c.email}</a> : null}</DetailRow>
            <DetailRow label="Mobile">{c.phone ? <a className="hover:underline" href={`tel:${c.phone.replace(/\s/g, "")}`}>{c.phone}</a> : null}</DetailRow>
            <DetailRow label="Billing address">{billing ? <span className="whitespace-pre-line">{billing}</span> : null}</DetailRow>
            <DetailRow label="Shipping address" always>
              {shipping ? <span className="whitespace-pre-line">{shipping}</span> : "Same as billing"}
            </DetailRow>
            <DetailRow label="Price list" always>{c.priceListName ?? "Standard prices"}</DetailRow>
            <DetailRow label="Opening balance">{c.openingBalancePaise ? formatPaise(c.openingBalancePaise) : null}</DetailRow>
            <DetailRow label="Notes">{c.notes ? <span className="whitespace-pre-line">{c.notes}</span> : null}</DetailRow>
          </dl>
        </CardContent>
      </Card>

      <CustomerAccount customerId={c.id} canRecord={c.canEdit} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export { Stat };
