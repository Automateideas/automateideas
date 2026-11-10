"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, Trash2Icon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, api, useApiQuery } from "@/lib/api";
import { TAX_CATEGORY_OPTIONS, type TaxCategoryValue } from "@/lib/business-billing/catalogue-validation";
import { DOCUMENT_TYPES, type DocumentSlug, todayInIndia } from "@/lib/business-billing/documents/types";
import { validateDocument } from "@/lib/business-billing/documents/validation";
import { formatPaise, paiseToRupees } from "@/lib/business-billing/fields";
import type { DocumentTaxResult } from "@/lib/business-billing/tax/gst";

import { LoadError } from "../../../_components/page-parts";
import { BackLink, type Errors, MoneyField, ReadOnlyNote, STATE_OPTIONS, SelectField, TaxRateField, TextField, cleanDecimal, focusFirstError, saveError } from "../records-ui";
import { TaxBreakdown } from "../tax-settings";
import { SalesNav } from "./documents-ui";

const BASE = "/api/business-billing";
const POS_OPTIONS = [...STATE_OPTIONS, { value: "96", label: "Outside India (96)" }];

type CatalogueItem = { id: string; name: string; code: string | null; hsnSac: string | null; ratePaise: number; listPricePaise: number | null; taxCategory: TaxCategoryValue; taxRate: string; cessRate: string; unitCode: string | null };
type Lookups = {
  company: { configured: boolean; registered: boolean; stateCode: string | null; pricesIncludeTax: boolean; roundOff: string };
  customer: { id: string; name: string; gstin: string | null; archived: boolean; placeOfSupply: string | null; paymentTermsDays: number | null } | null;
  catalogue: { products: CatalogueItem[]; services: CatalogueItem[] };
  invoices: { id: string; number: string; issueDate: string; totalPaise: number }[];
};
type Pick = CatalogueItem & { kind: "product" | "service" };
type CustomerOption = { id: string; name: string; gstin: string | null };

type Discount = { type: "percent"; percent: string } | { type: "amount"; paise: number } | null;
type StoredItem = { productId: string | null; serviceId: string | null; description: string; hsnSac: string | null; quantity: string; unitCode: string | null; ratePaise: number; discount: Discount; taxCategory: string; taxRate: string; cessRate: string };
type StoredDoc = {
  id: string;
  status: string;
  customerId: string;
  partyName: string | null;
  issueDate: string;
  extraDate: string | null;
  invoiceId: string | null;
  reason: string | null;
  placeOfSupply: string | null;
  pricesIncludeTax: boolean;
  reverseCharge: boolean;
  zeroRated: string | null;
  invoiceDiscount: Discount;
  charges: { label: string; amountPaise: number; appliedTaxRate: string }[];
  notes: string | null;
  terms: string | null;
  items: StoredItem[];
  actions: { edit: boolean; readOnlyReason: string | null };
};

type LineForm = {
  key: number;
  productId: string;
  serviceId: string;
  description: string;
  hsnSac: string;
  quantity: string;
  unitCode: string;
  rate: string;
  discountType: "percent" | "amount";
  discount: string;
  taxCategory: TaxCategoryValue;
  taxRate: string;
  cessRate: string;
};
type ChargeForm = { key: number; label: string; amount: string; taxRate: string };
type FormState = {
  customerId: string;
  customerName: string;
  issueDate: string;
  extraDate: string;
  invoiceId: string;
  reason: string;
  placeOfSupply: string;
  /** null: use the company default. */
  pricesIncludeTax: boolean | null;
  reverseCharge: boolean;
  zeroRated: string;
  invDiscountType: "percent" | "amount";
  invDiscount: string;
  charges: ChargeForm[];
  notes: string;
  terms: string;
  lines: LineForm[];
};

let nextKey = 1;
const blankLine = (): LineForm => ({ key: nextKey++, productId: "", serviceId: "", description: "", hsnSac: "", quantity: "1", unitCode: "", rate: "", discountType: "percent", discount: "", taxCategory: "taxable", taxRate: "18", cessRate: "" });

function discountForm(d: Discount): { type: "percent" | "amount"; value: string } {
  if (!d) return { type: "percent", value: "" };
  return d.type === "percent" ? { type: "percent", value: d.percent } : { type: "amount", value: paiseToRupees(d.paise) };
}

function toForm(d: StoredDoc | null, prefill?: { customerId: string | null }): FormState {
  const inv = discountForm(d?.invoiceDiscount ?? null);
  return {
    customerId: d?.customerId ?? prefill?.customerId ?? "",
    customerName: d?.partyName ?? "",
    issueDate: d?.issueDate ?? todayInIndia(),
    extraDate: d?.extraDate ?? "",
    invoiceId: d?.invoiceId ?? "",
    reason: d?.reason ?? "",
    placeOfSupply: d?.placeOfSupply ?? "",
    pricesIncludeTax: d ? d.pricesIncludeTax : null,
    reverseCharge: d?.reverseCharge ?? false,
    zeroRated: d?.zeroRated ?? "",
    invDiscountType: inv.type,
    invDiscount: inv.value,
    charges: (d?.charges ?? []).map((c) => ({ key: nextKey++, label: c.label, amount: paiseToRupees(c.amountPaise), taxRate: cleanDecimal(c.appliedTaxRate) || "0" })),
    notes: d?.notes ?? "",
    terms: d?.terms ?? "",
    lines: d?.items.length
      ? d.items.map((i) => {
          const disc = discountForm(i.discount);
          return {
            key: nextKey++,
            productId: i.productId ?? "",
            serviceId: i.serviceId ?? "",
            description: i.description,
            hsnSac: i.hsnSac ?? "",
            quantity: cleanDecimal(i.quantity) || "0",
            unitCode: i.unitCode ?? "",
            rate: paiseToRupees(i.ratePaise),
            discountType: disc.type,
            discount: disc.value,
            taxCategory: i.taxCategory as TaxCategoryValue,
            taxRate: cleanDecimal(i.taxRate) || "0",
            cessRate: cleanDecimal(i.cessRate),
          };
        })
      : [blankLine()],
  };
}

function toPayload(f: FormState) {
  return {
    customerId: f.customerId,
    issueDate: f.issueDate,
    extraDate: f.extraDate || null,
    invoiceId: f.invoiceId || null,
    reason: f.reason,
    placeOfSupply: f.placeOfSupply || null,
    pricesIncludeTax: f.pricesIncludeTax ?? false,
    reverseCharge: f.reverseCharge,
    zeroRated: f.zeroRated || null,
    invoiceDiscount: f.invDiscount ? { type: f.invDiscountType, value: f.invDiscount } : null,
    charges: f.charges.map((c) => ({ label: c.label, amount: c.amount, taxRate: c.taxRate })),
    notes: f.notes,
    terms: f.terms,
    lines: f.lines.map((l) => ({
      productId: l.productId || null,
      serviceId: l.serviceId || null,
      description: l.description,
      hsnSac: l.hsnSac,
      quantity: l.quantity,
      unitCode: l.unitCode,
      rate: l.rate,
      discount: l.discount ? { type: l.discountType, value: l.discount } : null,
      taxCategory: l.taxCategory,
      taxRate: l.taxRate,
      cessRate: l.cessRate || "0",
    })),
  };
}

/* ---------------- Page ---------------- */

export function DocumentEditorPage({ slug, id }: { slug: DocumentSlug; id?: string }) {
  return id ? <EditExisting slug={slug} id={id} /> : <NewDocument slug={slug} />;
}

/** New documents start with the template's default terms and notes. */
function NewDocument({ slug }: { slug: DocumentSlug }) {
  const t = useApiQuery<{ template: { defaultTerms: string | null; defaultNotes: string | null } }>(`${BASE}/template`);
  if (t.status === "loading") return <Skeleton className="h-160 max-w-5xl rounded-xl" aria-label="Loading" />;
  return <DocumentEditor slug={slug} initial={null} defaults={{ terms: t.data?.template.defaultTerms ?? "", notes: t.data?.template.defaultNotes ?? "" }} />;
}

function EditExisting({ slug, id }: { slug: DocumentSlug; id: string }) {
  const q = useApiQuery<StoredDoc>(`${BASE}/documents/${slug}/${id}`);
  if (q.status === "loading") return <Skeleton className="h-160 max-w-5xl rounded-xl" aria-label="Loading" />;
  if (!q.data) return <LoadError message={q.error.message} onRetry={q.reload} />;
  if (!q.data.actions.edit) {
    return (
      <div className="flex flex-col gap-4">
        <BackLink href={`/billing/${slug}/${id}`}>Back</BackLink>
        <ReadOnlyNote reason={q.data.actions.readOnlyReason} fallback={q.data.status === "draft" ? "You can't edit this document." : "This document is issued and locked. Void it, or raise a credit or debit note."} />
      </div>
    );
  }
  return <DocumentEditor slug={slug} initial={q.data} />;
}

function DocumentEditor({ slug, initial, defaults }: { slug: DocumentSlug; initial: StoredDoc | null; defaults?: { terms: string; notes: string } }) {
  const type = DOCUMENT_TYPES[slug];
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => {
    const f = toForm(initial);
    return initial || !defaults ? f : { ...f, terms: defaults.terms, notes: defaults.notes };
  });
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const customers = useApiQuery<{ items: CustomerOption[] }>(`${BASE}/customers?pageSize=200`);
  const lookups = useApiQuery<Lookups>(`${BASE}/documents/lookups${form.customerId ? `?customerId=${form.customerId}` : ""}`);
  const company = lookups.data?.company;


  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setLine = (key: number, patch: Partial<LineForm>) => setForm((f) => ({ ...f, lines: f.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));

  const picks: Pick[] = useMemo(
    () => [...(lookups.data?.catalogue.products ?? []).map((p) => ({ ...p, kind: "product" as const })), ...(lookups.data?.catalogue.services ?? []).map((s) => ({ ...s, kind: "service" as const }))],
    [lookups.data],
  );

  // Picking a customer clears the place of supply, so it falls back to theirs.
  function chooseCustomer(c: CustomerOption | null) {
    setForm((f) => ({ ...f, customerId: c?.id ?? "", customerName: c?.name ?? "", invoiceId: "", placeOfSupply: "" }));
  }

  function chooseItem(key: number, p: Pick | null) {
    if (!p) return setLine(key, { productId: "", serviceId: "" });
    setLine(key, {
      productId: p.kind === "product" ? p.id : "",
      serviceId: p.kind === "service" ? p.id : "",
      description: p.name,
      hsnSac: p.hsnSac ?? "",
      unitCode: p.unitCode ?? "",
      rate: paiseToRupees(p.listPricePaise ?? p.ratePaise),
      taxCategory: p.taxCategory,
      taxRate: cleanDecimal(p.taxRate) || "0",
      cessRate: cleanDecimal(p.cessRate),
    });
  }

  // Blank choices fall back to defaults: the customer's place of supply, the company's GST-inclusive setting.
  const defaultPos = lookups.data?.customer?.id === form.customerId ? (lookups.data.customer.placeOfSupply ?? "") : "";
  const effective: FormState = {
    ...form,
    placeOfSupply: form.placeOfSupply || defaultPos,
    pricesIncludeTax: form.pricesIncludeTax ?? company?.pricesIncludeTax ?? false,
  };

  // Live totals from the server's GST engine (debounced).
  const payload = toPayload(effective);
  const payloadKey = JSON.stringify(payload);
  const [preview, setPreview] = useState<{ result: DocumentTaxResult | null; error: string | null }>({ result: null, error: null });
  useEffect(() => {
    if (!company?.configured) return;
    const t = setTimeout(() => {
      const p = JSON.parse(payloadKey) as ReturnType<typeof toPayload>;
      const lines = p.lines.filter((l) => l.description || l.rate);
      if (!lines.length || !lines.every((l) => l.rate !== "")) return setPreview({ result: null, error: null });
      api<DocumentTaxResult>(`${BASE}/tax/calculate`, { method: "POST", json: { ...p, lines } }).then(
        (result) => setPreview({ result, error: null }),
        (e) => setPreview({ result: null, error: e instanceof ApiError ? e.message : "Couldn't calculate." }),
      );
    }, 400);
    return () => clearTimeout(t);
  }, [payloadKey, company?.configured]);

  function save(andIssue: boolean) {
    setFormError(null);
    const local = validateDocument(slug, payload);
    if (!local.ok) {
      setErrors(local.errors);
      focusFirstError();
      return;
    }
    setErrors({});
    start(async () => {
      try {
        const saved = await api<{ id: string }>(initial ? `${BASE}/documents/${slug}/${initial.id}` : `${BASE}/documents/${slug}`, {
          method: initial ? "PUT" : "POST",
          json: payload,
        });
        if (andIssue) {
          try {
            await api(`${BASE}/documents/${slug}/${saved.id}/issue`, { method: "POST" });
          } catch (e) {
            // Saved as a draft; the document page shows why it couldn't be issued.
            try {
              sessionStorage.setItem(`issue-error:${saved.id}`, e instanceof ApiError ? e.message : "Couldn't issue it.");
            } catch {}
            router.push(`/billing/${slug}/${saved.id}`);
            return;
          }
        }
        router.push(`/billing/${slug}/${saved.id}`);
      } catch (e) {
        setFormError(saveError(e, setErrors));
      }
    });
  }

  if (lookups.status === "loading" && !lookups.data) return <Skeleton className="h-160 max-w-5xl rounded-xl" aria-label="Loading" />;
  if (company && !company.configured) {
    return <ReadOnlyNote reason="Save your company details first (Billing → Settings), so documents carry your GSTIN and address." />;
  }

  const customerItems = customers.data?.items ?? [];
  const chosenCustomer = customerItems.find((c) => c.id === form.customerId) ?? (form.customerId ? { id: form.customerId, name: form.customerName, gstin: null } : null);
  const backHref = initial ? `/billing/${slug}/${initial.id}` : `/billing/${slug}`;

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save(false);
      }}
      className="flex max-w-6xl flex-col gap-6"
    >
      <SalesNav />
      <BackLink href={backHref}>Back</BackLink>
      <h2 className="text-lg font-semibold">{initial ? `Edit draft ${type.singular.toLowerCase()}` : `New ${type.singular.toLowerCase()}`}</h2>

      <Card>
        <CardHeader>
          <CardTitle>Customer and dates</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <div className="grid gap-5 md:grid-cols-3">
              <Field data-invalid={!!errors.customerId} className="md:col-span-1">
                <FieldLabel htmlFor="d-customer">Customer</FieldLabel>
                <Combobox
                  items={customerItems}
                  value={chosenCustomer}
                  onValueChange={(c: CustomerOption | null) => chooseCustomer(c)}
                  itemToStringLabel={(c: CustomerOption) => c.name}
                  isItemEqualToValue={(a: CustomerOption, b: CustomerOption) => a.id === b.id}
                  autoHighlight
                  disabled={type.needsInvoice && !!initial?.invoiceId}
                >
                  <ComboboxInput id="d-customer" placeholder="Search customers" className="w-full" aria-invalid={!!errors.customerId} />
                  <ComboboxContent>
                    <ComboboxEmpty>No customer matches. Add them under Customers first.</ComboboxEmpty>
                    <ComboboxList>
                      {(c: CustomerOption) => (
                        <ComboboxItem key={c.id} value={c}>
                          <span className="flex-1 truncate">{c.name}</span>
                          {c.gstin ? <span className="font-mono text-xs text-muted-foreground">{c.gstin}</span> : null}
                        </ComboboxItem>
                      )}
                    </ComboboxList>
                  </ComboboxContent>
                </Combobox>
                <FieldError>{errors.customerId}</FieldError>
              </Field>
              <TextField id="d-date" label="Date" type="date" value={form.issueDate} onValue={(v) => set("issueDate", v)} error={errors.issueDate} />
              {type.extraDate ? (
                <TextField
                  id="d-extra"
                  label={type.extraDate.label}
                  optional
                  type="date"
                  value={form.extraDate}
                  onValue={(v) => set("extraDate", v)}
                  error={errors.extraDate}
                  hint={slug === "invoices" && lookups.data?.customer?.paymentTermsDays != null && !form.extraDate ? `Blank: ${lookups.data.customer.paymentTermsDays} days (customer's terms).` : undefined}
                />
              ) : null}
            </div>
            {type.needsInvoice ? (
              <div className="grid gap-5 md:grid-cols-2">
                <SelectField
                  id="d-invoice"
                  label="Against invoice"
                  value={form.invoiceId}
                  onValue={(v) => set("invoiceId", v)}
                  options={(lookups.data?.invoices ?? []).map((i) => ({ value: i.id, label: `${i.number} · ${formatPaise(i.totalPaise)}` }))}
                  placeholder={form.customerId ? "Choose the invoice" : "Choose a customer first"}
                  error={errors.invoiceId}
                />
                <TextField id="d-reason" label="Reason" value={form.reason} onValue={(v) => set("reason", v)} error={errors.reason} placeholder={slug === "credit-notes" ? "e.g. Goods returned" : "e.g. Extra freight"} />
              </div>
            ) : null}
          </FieldGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
          <CardDescription>{effective.pricesIncludeTax ? "Rates include GST." : "Rates are before GST."} Pick from your catalogue or type a one-off item.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {errors.lines ? <p role="alert" className="text-sm text-destructive">{errors.lines}</p> : null}
          {form.lines.map((l, i) => {
            const e = (k: string) => errors[`lines.${i}.${k}`];
            const picked = picks.find((p) => (p.kind === "product" ? p.id === l.productId : p.id === l.serviceId)) ?? null;
            return (
              <div key={l.key} className="grid grid-cols-2 gap-3 rounded-lg border p-3 lg:grid-cols-12 lg:items-start">
                <Field className="col-span-2 lg:col-span-3" data-invalid={!!e("productId")}>
                  <FieldLabel htmlFor={`l-item-${l.key}`}>Catalogue item</FieldLabel>
                  <Combobox
                    items={picks}
                    value={picked}
                    onValueChange={(p: Pick | null) => chooseItem(l.key, p)}
                    itemToStringLabel={(p: Pick) => p.name}
                    isItemEqualToValue={(a: Pick, b: Pick) => a.id === b.id}
                    autoHighlight
                  >
                    <ComboboxInput id={`l-item-${l.key}`} placeholder="Search or leave blank" className="w-full" />
                    <ComboboxContent>
                      <ComboboxEmpty>No match. Type the item in Description instead.</ComboboxEmpty>
                      <ComboboxList>
                        {(p: Pick) => (
                          <ComboboxItem key={p.id} value={p}>
                            <span className="flex-1 truncate">{p.name}</span>
                            <span className="text-xs text-muted-foreground tabular-nums">{formatPaise(p.listPricePaise ?? p.ratePaise)}</span>
                          </ComboboxItem>
                        )}
                      </ComboboxList>
                    </ComboboxContent>
                  </Combobox>
                </Field>
                <TextField id={`l-desc-${l.key}`} label="Description" className="col-span-2 lg:col-span-3" value={l.description} onValue={(v) => setLine(l.key, { description: v })} error={e("description")} />
                <TextField id={`l-hsn-${l.key}`} label="HSN/SAC" className="lg:col-span-1" inputMode="numeric" maxLength={8} value={l.hsnSac} onValue={(v) => setLine(l.key, { hsnSac: v.replace(/\D/g, "") })} error={e("hsnSac")} />
                <TextField id={`l-qty-${l.key}`} label={`Qty${l.unitCode ? ` (${l.unitCode})` : ""}`} className="lg:col-span-1" inputMode="decimal" value={l.quantity} onValue={(v) => setLine(l.key, { quantity: v.replace(/[^\d.]/g, "") })} error={e("quantity")} />
                <div className="lg:col-span-2">
                  <MoneyField id={`l-rate-${l.key}`} label="Rate" value={l.rate} onValue={(v) => setLine(l.key, { rate: v })} error={e("rate")} />
                </div>
                <TextField id={`l-disc-${l.key}`} label="Disc %" className="lg:col-span-1" inputMode="decimal" value={l.discount} onValue={(v) => setLine(l.key, { discount: v.replace(/[^\d.]/g, ""), discountType: "percent" })} error={e("discount.value") ?? e("discount")} />
                <div className="flex items-end gap-2 lg:col-span-1">
                  {l.taxCategory === "taxable" ? (
                    <TaxRateField id={`l-tax-${l.key}`} label="GST" value={l.taxRate} onValue={(v) => setLine(l.key, { taxRate: v })} error={e("taxRate")} />
                  ) : (
                    <SelectField id={`l-cat-${l.key}`} label="GST" value={l.taxCategory} onValue={(v) => setLine(l.key, { taxCategory: (v || "taxable") as TaxCategoryValue })} options={TAX_CATEGORY_OPTIONS} />
                  )}
                </div>
                <div className="col-span-2 flex flex-wrap items-center justify-between gap-2 lg:col-span-12">
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <SelectField
                      id={`l-type-${l.key}`}
                      label="GST treatment"
                      value={l.taxCategory}
                      onValue={(v) => setLine(l.key, { taxCategory: (v || "taxable") as TaxCategoryValue })}
                      options={TAX_CATEGORY_OPTIONS}
                      className="w-52 gap-1 [&>label]:sr-only"
                    />
                    {preview.result?.lines[i] ? <span className="tabular-nums">Line total {formatPaise(preview.result.lines[i].totalPaise)}</span> : null}
                  </div>
                  {form.lines.length > 1 ? (
                    <Button type="button" variant="ghost" size="sm" onClick={() => set("lines", form.lines.filter((x) => x.key !== l.key))} aria-label={`Remove line ${i + 1}`}>
                      <Trash2Icon />
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
          <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => set("lines", [...form.lines, blankLine()])}>
            <PlusIcon data-icon="inline-start" />
            Add item
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Card>
          <CardHeader>
            <CardTitle>Tax and extras</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <div className="grid gap-5 sm:grid-cols-2">
                <SelectField
                  id="d-pos"
                  label="Place of supply"
                  value={effective.placeOfSupply}
                  onValue={(v) => set("placeOfSupply", v)}
                  options={POS_OPTIONS}
                  placeholder="Customer's state"
                  error={errors.placeOfSupply}
                  hint={company?.registered ? (effective.placeOfSupply && effective.placeOfSupply === company.stateCode ? "Same state: CGST + SGST." : effective.placeOfSupply ? "Other state or abroad: IGST." : undefined) : "You're not GST registered, so no GST is charged."}
                />
                <SelectField
                  id="d-zero"
                  label="Export or SEZ"
                  value={form.zeroRated}
                  onValue={(v) => set("zeroRated", v)}
                  noneLabel="No"
                  options={[
                    { value: "lut", label: "Yes, under LUT (no GST)" },
                    { value: "with_payment", label: "Yes, with IGST paid" },
                  ]}
                  error={errors.zeroRated}
                />
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-3">
                <Field orientation="horizontal" className="w-auto">
                  <Checkbox id="d-incl" checked={!!effective.pricesIncludeTax} onCheckedChange={(c) => set("pricesIncludeTax", c === true)} />
                  <FieldLabel htmlFor="d-incl" className="font-normal">Rates include GST</FieldLabel>
                </Field>
                <Field orientation="horizontal" className="w-auto">
                  <Checkbox id="d-rcm" checked={form.reverseCharge} onCheckedChange={(c) => set("reverseCharge", c === true)} />
                  <FieldLabel htmlFor="d-rcm" className="font-normal">Reverse charge applies</FieldLabel>
                </Field>
              </div>
              {errors.pricesIncludeTax ? <FieldError>{errors.pricesIncludeTax}</FieldError> : null}
              <div className="grid gap-5 sm:grid-cols-[8rem_1fr]">
                <SelectField
                  id="d-invdisc-type"
                  label="Invoice discount"
                  value={form.invDiscountType}
                  onValue={(v) => set("invDiscountType", (v || "percent") as "percent" | "amount")}
                  options={[
                    { value: "percent", label: "Percent" },
                    { value: "amount", label: "Amount (₹)" },
                  ]}
                />
                <TextField
                  id="d-invdisc"
                  label={form.invDiscountType === "percent" ? "Discount %" : "Discount ₹"}
                  optional
                  inputMode="decimal"
                  value={form.invDiscount}
                  onValue={(v) => set("invDiscount", v.replace(/[^\d.,]/g, ""))}
                  error={errors["invoiceDiscount.value"] ?? errors.invoiceDiscount}
                  hint="Spread across items before GST."
                />
              </div>
              <div className="flex flex-col gap-3">
                <p className="text-sm font-medium">Additional charges</p>
                {form.charges.map((c, i) => (
                  <div key={c.key} className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[1fr_9rem_7rem_auto]">
                    <TextField id={`c-label-${c.key}`} label="Charge" className="col-span-2 sm:col-span-1" value={c.label} onValue={(v) => set("charges", form.charges.map((x) => (x.key === c.key ? { ...x, label: v } : x)))} error={errors[`charges.${i}.label`]} placeholder="e.g. Shipping" />
                    <MoneyField id={`c-amt-${c.key}`} label="Amount" value={c.amount} onValue={(v) => set("charges", form.charges.map((x) => (x.key === c.key ? { ...x, amount: v } : x)))} error={errors[`charges.${i}.amount`]} />
                    <TaxRateField id={`c-tax-${c.key}`} label="GST" value={c.taxRate} onValue={(v) => set("charges", form.charges.map((x) => (x.key === c.key ? { ...x, taxRate: v } : x)))} error={errors[`charges.${i}.taxRate`]} />
                    <Button type="button" variant="ghost" size="sm" onClick={() => set("charges", form.charges.filter((x) => x.key !== c.key))} aria-label="Remove charge">
                      <Trash2Icon />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => set("charges", [...form.charges, { key: nextKey++, label: "Shipping", amount: "", taxRate: "18" }])} disabled={form.charges.length >= 10}>
                  <PlusIcon data-icon="inline-start" />
                  Add charge
                </Button>
              </div>
              <Field>
                <FieldLabel htmlFor="d-notes">Notes <span className="font-normal text-muted-foreground">(optional, printed)</span></FieldLabel>
                <Textarea id="d-notes" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="d-terms">Terms and conditions <span className="font-normal text-muted-foreground">(optional, printed)</span></FieldLabel>
                <Textarea id="d-terms" rows={3} value={form.terms} onChange={(e) => set("terms", e.target.value)} />
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4 lg:sticky lg:top-4 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle>Totals</CardTitle>
              <CardDescription>Calculated by the server; the saved document is recalculated the same way.</CardDescription>
            </CardHeader>
            <CardContent>
              {preview.result ? (
                <TaxBreakdown result={preview.result} registered={!!company?.registered} />
              ) : (
                <p className="text-sm text-muted-foreground">{preview.error ?? "Add items with rates to see totals."}</p>
              )}
            </CardContent>
          </Card>
          <div className="flex flex-col gap-2">
            <Button type="button" onClick={() => save(true)} disabled={pending}>
              {pending ? <Spinner data-icon="inline-start" /> : null}
              Save and {type.issueLabel.toLowerCase()}
            </Button>
            <Button type="submit" variant="outline" disabled={pending}>
              Save draft
            </Button>
            {formError ? <p role="alert" className="text-sm text-destructive">{formError}</p> : null}
          </div>
        </div>
      </div>
    </form>
  );
}
