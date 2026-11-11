"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BoxIcon, FolderTreeIcon, PencilIcon, PlusIcon, RulerIcon, StarIcon, TagsIcon, Trash2Icon, WrenchIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, api, useApiQuery } from "@/lib/api";
import {
  TAX_CATEGORY_OPTIONS,
  type TaxCategoryValue,
  validateCategory,
  validatePriceList,
  validatePriceListItem,
  validateProduct,
  validateService,
  validateUnit,
} from "@/lib/business-billing/catalogue-validation";
import { formatPaise, paiseToRupees } from "@/lib/business-billing/fields";

import { LoadError } from "../../_components/page-parts";
import { SectionNav } from "../../_components/section-nav";
import {
  ArchiveButton,
  ArchivedBadge,
  BackLink,
  EmptyList,
  type Errors,
  FormActions,
  ListSkeleton,
  ListToolbar,
  type ListStatus,
  MoneyField,
  Pager,
  ReadOnlyNote,
  SelectField,
  TaxRateField,
  TextField,
  cleanDecimal,
  focusFirstError,
  saveError,
  useRecordList,
} from "./records-ui";

const BASE = "/api/business-billing";

/** "18%", or the category name for items without GST. */
function taxLabel(category: TaxCategoryValue, rate: string) {
  if (category === "taxable") return `${cleanDecimal(rate) || "0"}%`;
  return { exempt: "Exempt", nil_rated: "Nil", non_gst: "Non-GST" }[category];
}

/** Sub-tabs shared by every catalogue page. */
export function CatalogueNav() {
  return (
    <SectionNav
      label="Catalogue"
      links={[
        { href: "/billing/products", label: "Products", matchNested: true },
        { href: "/billing/services", label: "Services", matchNested: true },
        { href: "/billing/categories", label: "Categories" },
        { href: "/billing/units", label: "Units" },
        { href: "/billing/price-lists", label: "Price lists", matchNested: true },
      ]}
    />
  );
}

type Unit = { id: string; code: string; name: string; decimalPlaces: number; archivedAt: string | null; usedBy?: number };
type Category = { id: string; name: string; parentId: string | null; path: string; itemCount: number; archivedAt: string | null };
type Listed<T> = { items: T[]; canEdit: boolean; readOnlyReason: string | null };

function useLookups() {
  const units = useApiQuery<Listed<Unit>>(`${BASE}/units`);
  const categories = useApiQuery<Listed<Category>>(`${BASE}/categories`);
  return {
    unitOptions: (units.data?.items ?? []).map((u) => ({ value: u.id, label: `${u.code} · ${u.name}` })),
    categoryOptions: (categories.data?.items ?? []).map((c) => ({ value: c.id, label: c.path })),
    loading: units.status === "loading" || categories.status === "loading",
  };
}

/** Keeps the current choice visible even if it's been archived since. */
function withCurrent(options: { value: string; label: string }[], id: string | null | undefined, label: string | null | undefined) {
  if (!id || options.some((o) => o.value === id)) return options;
  return [...options, { value: id, label: `${label ?? "Archived"} (archived)` }];
}

function CategoryFilter({ value, onValue }: { value: string; onValue: (v: string) => void }) {
  const { categoryOptions } = useLookups();
  if (!categoryOptions.length) return null;
  return (
    <SelectField
      id="cat-filter"
      label="Category"
      value={value}
      onValue={onValue}
      options={categoryOptions}
      noneLabel="All categories"
      className="w-full gap-1 sm:w-56 [&>label]:sr-only"
    />
  );
}

/* ---------------- Products ---------------- */

type Product = {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  description: string | null;
  brand: string | null;
  categoryId: string | null;
  categoryName: string | null;
  unitId: string;
  unitCode: string;
  hsnCode: string | null;
  taxCategory: TaxCategoryValue;
  taxRate: string;
  cessRate: string;
  salePricePaise: number;
  purchasePricePaise: number;
  trackInventory: boolean;
  minStockQty: string | null;
  archivedAt: string | null;
  canEdit?: boolean;
  readOnlyReason?: string | null;
};

export function ProductsList() {
  const [categoryId, setCategoryId] = useState("");
  const list = useRecordList<Product>(`${BASE}/products`, { categoryId: categoryId || null });
  const { query } = list;
  const canEdit = query.data?.canEdit ?? false;
  const add = (
    <Button render={<Link href="/billing/products/create" />} nativeButton={false}>
      <PlusIcon data-icon="inline-start" />
      Add product
    </Button>
  );

  return (
    <div className="flex flex-col gap-4">
      <CatalogueNav />
      <ListToolbar search={list.search} onSearch={list.setSearch} placeholder="Search name, SKU, barcode or HSN" status={list.status} onStatus={list.setStatus}>
        <CategoryFilter value={categoryId} onValue={(v) => { setCategoryId(v); list.setPage(1); }} />
        {canEdit ? add : null}
      </ListToolbar>
      {query.data && !query.data.canEdit ? <ReadOnlyNote reason={query.data.readOnlyReason} /> : null}
      {query.status === "loading" ? (
        <ListSkeleton />
      ) : !query.data ? (
        <LoadError message={query.error.message} onRetry={query.reload} />
      ) : query.data.items.length === 0 ? (
        <EmptyList
          Icon={BoxIcon}
          title="No products yet"
          description="Add the goods you sell with their HSN code, GST rate and price. They fill in invoice lines for you."
          filtered={list.filtered || !!categoryId}
          action={canEdit ? add : undefined}
        />
      ) : (
        <>
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="hidden md:table-cell">HSN</TableHead>
                  <TableHead className="hidden sm:table-cell">GST</TableHead>
                  <TableHead className="hidden lg:table-cell">Unit</TableHead>
                  <TableHead className="text-right">Sale price</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.items.map((p) => (
                  <TableRow key={p.id} className={p.archivedAt ? "text-muted-foreground" : undefined}>
                    <TableCell>
                      <div className="flex max-w-56 min-w-0 flex-col sm:max-w-none">
                        <Link href={`/billing/products/${p.id}`} className="truncate font-medium text-foreground hover:underline">
                          {p.name}
                        </Link>
                        <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          {[p.sku, p.categoryName, p.brand].filter(Boolean).join(" · ")}
                          {p.trackInventory ? <Badge variant="outline">Stock tracked</Badge> : null}
                          {p.archivedAt ? <ArchivedBadge /> : null}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden font-mono text-xs md:table-cell">{p.hsnCode ?? "—"}</TableCell>
                    <TableCell className="hidden sm:table-cell">{taxLabel(p.taxCategory, p.taxRate)}</TableCell>
                    <TableCell className="hidden lg:table-cell">{p.unitCode}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatPaise(p.salePricePaise)}</TableCell>
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

export function ProductFormPage({ id }: { id?: string }) {
  return id ? <LoadThen<Product> url={`${BASE}/products/${id}`} render={(p, reload) => <ProductForm initial={p} onSaved={reload} />} /> : <ProductForm initial={null} />;
}

/** Loads a record, then renders it (or a load error). */
function LoadThen<T>({ url, render }: { url: string; render: (data: T, reload: () => void) => React.ReactNode }) {
  const q = useApiQuery<T>(url);
  if (q.status === "loading") return <Skeleton className="h-96 max-w-3xl rounded-xl" aria-label="Loading" />;
  if (q.status === "error" && !q.data) return <LoadError message={q.error.message} onRetry={q.reload} />;
  return render(q.data as T, q.reload);
}

function ProductForm({ initial, onSaved }: { initial: Product | null; onSaved?: () => void }) {
  const router = useRouter();
  const { unitOptions, categoryOptions } = useLookups();
  const readOnly = !!initial && !initial.canEdit;
  const [form, setForm] = useState(() => ({
    name: initial?.name ?? "",
    sku: initial?.sku ?? "",
    barcode: initial?.barcode ?? "",
    description: initial?.description ?? "",
    brand: initial?.brand ?? "",
    categoryId: initial?.categoryId ?? "",
    unitId: initial?.unitId ?? "",
    hsnCode: initial?.hsnCode ?? "",
    taxCategory: (initial?.taxCategory ?? "taxable") as TaxCategoryValue,
    taxRate: initial ? cleanDecimal(initial.taxRate) || "0" : "18",
    cessRate: cleanDecimal(initial?.cessRate) || "",
    salePrice: initial ? paiseToRupees(initial.salePricePaise) : "",
    purchasePrice: initial?.purchasePricePaise ? paiseToRupees(initial.purchasePricePaise) : "",
    trackInventory: initial?.trackInventory ?? false,
    minStockQty: cleanDecimal(initial?.minStockQty),
  }));
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const payload = { ...form, categoryId: form.categoryId || null, unitId: form.unitId || null };
    const local = validateProduct(payload);
    if (!local.ok) {
      setErrors(local.errors);
      focusFirstError();
      return;
    }
    setErrors({});
    start(async () => {
      try {
        await api(initial ? `${BASE}/products/${initial.id}` : `${BASE}/products`, { method: initial ? "PUT" : "POST", json: payload });
        router.push("/billing/products");
        onSaved?.();
      } catch (err) {
        setFormError(saveError(err, setErrors));
      }
    });
  }

  return (
    <form noValidate onSubmit={onSubmit} className="flex max-w-3xl flex-col gap-6">
      <BackLink href="/billing/products">Back to products</BackLink>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          {initial ? initial.name : "Add product"}
          {initial?.archivedAt ? <ArchivedBadge /> : null}
        </h2>
        {initial?.canEdit ? (
          <ArchiveButton
            endpoint={`${BASE}/products/${initial.id}`}
            archived={!!initial.archivedAt}
            name={initial.name}
            kind="product"
            consequence="It won't appear in lists or when creating invoices. Past invoices keep it."
            onDone={() => onSaved?.()}
          />
        ) : null}
      </div>
      {readOnly ? <ReadOnlyNote reason={initial?.readOnlyReason ?? null} fallback="You can view products but not change them." /> : null}

      <fieldset disabled={readOnly || pending} className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Product</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <TextField id="p-name" label="Name" value={form.name} onValue={(v) => set("name", v)} error={errors.name} autoComplete="off" required />
              <div className="grid gap-5 sm:grid-cols-2">
                <TextField id="p-sku" label="SKU / product code" optional value={form.sku} onValue={(v) => set("sku", v)} error={errors.sku} autoComplete="off" />
                <TextField id="p-barcode" label="Barcode" optional value={form.barcode} onValue={(v) => set("barcode", v)} error={errors.barcode} autoComplete="off" />
                <TextField id="p-brand" label="Brand" optional value={form.brand} onValue={(v) => set("brand", v)} error={errors.brand} autoComplete="off" />
                <SelectField
                  id="p-category"
                  label="Category"
                  optional
                  value={form.categoryId}
                  onValue={(v) => set("categoryId", v)}
                  options={withCurrent(categoryOptions, initial?.categoryId, initial?.categoryName)}
                  noneLabel="No category"
                  error={errors.categoryId}
                  hint={<Link href="/billing/categories" className="underline underline-offset-2">Manage categories</Link>}
                />
              </div>
              <Field data-invalid={!!errors.description}>
                <FieldLabel htmlFor="p-desc">
                  Description <span className="font-normal text-muted-foreground">(optional)</span>
                </FieldLabel>
                <Textarea id="p-desc" value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} aria-invalid={!!errors.description} />
                <FieldError>{errors.description}</FieldError>
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tax and price</CardTitle>
            <CardDescription>Prices are before GST.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField
                id="p-hsn"
                label="HSN code"
                optional
                inputMode="numeric"
                maxLength={8}
                value={form.hsnCode}
                onValue={(v) => set("hsnCode", v.replace(/\D/g, ""))}
                error={errors.hsnCode}
                hint="4, 6 or 8 digits. Needed on GST invoices."
              />
              <SelectField id="p-taxcat" label="GST treatment" value={form.taxCategory} onValue={(v) => set("taxCategory", (v || "taxable") as TaxCategoryValue)} options={TAX_CATEGORY_OPTIONS} error={errors.taxCategory} />
              {form.taxCategory === "taxable" ? (
                <>
                  <TaxRateField id="p-tax" value={form.taxRate} onValue={(v) => set("taxRate", v)} error={errors.taxRate} />
                  <TextField
                    id="p-cess"
                    label="Cess %"
                    optional
                    inputMode="decimal"
                    value={form.cessRate}
                    onValue={(v) => set("cessRate", v.replace(/[^\d.]/g, ""))}
                    error={errors.cessRate}
                    hint="Only for goods with compensation cess."
                  />
                </>
              ) : null}
              <MoneyField id="p-sale" label="Selling price" value={form.salePrice} onValue={(v) => set("salePrice", v)} error={errors.salePrice} />
              <MoneyField id="p-purchase" label="Purchase price" optional value={form.purchasePrice} onValue={(v) => set("purchasePrice", v)} error={errors.purchasePrice} />
              <SelectField
                id="p-unit"
                label="Unit"
                value={form.unitId}
                onValue={(v) => set("unitId", v)}
                options={withCurrent(unitOptions, initial?.unitId, initial?.unitCode)}
                placeholder="Choose a unit"
                error={errors.unitId}
                hint={<Link href="/billing/units" className="underline underline-offset-2">Manage units</Link>}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Stock</CardTitle>
            <CardDescription>Leave off for items you don&apos;t keep in stock.</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field orientation="horizontal">
                <Checkbox id="p-track" checked={form.trackInventory} onCheckedChange={(c) => set("trackInventory", c === true)} />
                <FieldLabel htmlFor="p-track" className="font-normal">
                  Track stock for this product
                </FieldLabel>
              </Field>
              {form.trackInventory ? (
                <TextField
                  id="p-min"
                  label="Low-stock alert at"
                  optional
                  inputMode="decimal"
                  value={form.minStockQty}
                  onValue={(v) => set("minStockQty", v.replace(/[^\d.]/g, ""))}
                  error={errors.minStockQty}
                  className="sm:max-w-48"
                  hint="Shown as low stock when the total across warehouses falls below this."
                />
              ) : null}
              {initial?.trackInventory ? (
                <Link href={`/billing/stock/${initial.id}`} className="text-sm underline underline-offset-2">
                  View stock and history
                </Link>
              ) : form.trackInventory ? (
                <p className="text-sm text-muted-foreground">After saving, purchases, sales and returns of this product move its stock. Enter what you have now as opening stock under Inventory.</p>
              ) : null}
            </FieldGroup>
          </CardContent>
        </Card>
      </fieldset>

      {readOnly ? null : <FormActions pending={pending} submitLabel={initial ? "Save changes" : "Add product"} cancelHref="/billing/products" error={formError} />}
    </form>
  );
}

/* ---------------- Services ---------------- */

type Service = {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  unitId: string | null;
  unitCode: string | null;
  sacCode: string | null;
  taxCategory: TaxCategoryValue;
  taxRate: string;
  ratePaise: number;
  archivedAt: string | null;
  canEdit?: boolean;
  readOnlyReason?: string | null;
};

export function ServicesList() {
  const [categoryId, setCategoryId] = useState("");
  const list = useRecordList<Service>(`${BASE}/services`, { categoryId: categoryId || null });
  const { query } = list;
  const canEdit = query.data?.canEdit ?? false;
  const add = (
    <Button render={<Link href="/billing/services/create" />} nativeButton={false}>
      <PlusIcon data-icon="inline-start" />
      Add service
    </Button>
  );

  return (
    <div className="flex flex-col gap-4">
      <CatalogueNav />
      <ListToolbar search={list.search} onSearch={list.setSearch} placeholder="Search name, code or SAC" status={list.status} onStatus={list.setStatus}>
        <CategoryFilter value={categoryId} onValue={(v) => { setCategoryId(v); list.setPage(1); }} />
        {canEdit ? add : null}
      </ListToolbar>
      {query.data && !query.data.canEdit ? <ReadOnlyNote reason={query.data.readOnlyReason} /> : null}
      {query.status === "loading" ? (
        <ListSkeleton />
      ) : !query.data ? (
        <LoadError message={query.error.message} onRetry={query.reload} />
      ) : query.data.items.length === 0 ? (
        <EmptyList
          Icon={WrenchIcon}
          title="No services yet"
          description="Add the work you bill for, with its SAC code, GST rate and rate. No stock needed."
          filtered={list.filtered || !!categoryId}
          action={canEdit ? add : undefined}
        />
      ) : (
        <>
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Service</TableHead>
                  <TableHead className="hidden md:table-cell">SAC</TableHead>
                  <TableHead className="hidden sm:table-cell">GST</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {query.data.items.map((s) => (
                  <TableRow key={s.id} className={s.archivedAt ? "text-muted-foreground" : undefined}>
                    <TableCell>
                      <div className="flex max-w-56 min-w-0 flex-col sm:max-w-none">
                        <Link href={`/billing/services/${s.id}`} className="truncate font-medium text-foreground hover:underline">
                          {s.name}
                        </Link>
                        <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          {[s.code, s.categoryName].filter(Boolean).join(" · ")}
                          {s.archivedAt ? <ArchivedBadge /> : null}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden font-mono text-xs md:table-cell">{s.sacCode ?? "—"}</TableCell>
                    <TableCell className="hidden sm:table-cell">{taxLabel(s.taxCategory, s.taxRate)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPaise(s.ratePaise)}
                      {s.unitCode ? <span className="text-xs text-muted-foreground"> / {s.unitCode}</span> : null}
                    </TableCell>
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

export function ServiceFormPage({ id }: { id?: string }) {
  return id ? <LoadThen<Service> url={`${BASE}/services/${id}`} render={(s, reload) => <ServiceForm initial={s} onSaved={reload} />} /> : <ServiceForm initial={null} />;
}

function ServiceForm({ initial, onSaved }: { initial: Service | null; onSaved?: () => void }) {
  const router = useRouter();
  const { unitOptions, categoryOptions } = useLookups();
  const readOnly = !!initial && !initial.canEdit;
  const [form, setForm] = useState(() => ({
    name: initial?.name ?? "",
    code: initial?.code ?? "",
    description: initial?.description ?? "",
    categoryId: initial?.categoryId ?? "",
    unitId: initial?.unitId ?? "",
    sacCode: initial?.sacCode ?? "",
    taxCategory: (initial?.taxCategory ?? "taxable") as TaxCategoryValue,
    taxRate: initial ? cleanDecimal(initial.taxRate) || "0" : "18",
    rate: initial ? paiseToRupees(initial.ratePaise) : "",
  }));
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const payload = { ...form, categoryId: form.categoryId || null, unitId: form.unitId || null };
    const local = validateService(payload);
    if (!local.ok) {
      setErrors(local.errors);
      focusFirstError();
      return;
    }
    setErrors({});
    start(async () => {
      try {
        await api(initial ? `${BASE}/services/${initial.id}` : `${BASE}/services`, { method: initial ? "PUT" : "POST", json: payload });
        router.push("/billing/services");
        onSaved?.();
      } catch (err) {
        setFormError(saveError(err, setErrors));
      }
    });
  }

  return (
    <form noValidate onSubmit={onSubmit} className="flex max-w-3xl flex-col gap-6">
      <BackLink href="/billing/services">Back to services</BackLink>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          {initial ? initial.name : "Add service"}
          {initial?.archivedAt ? <ArchivedBadge /> : null}
        </h2>
        {initial?.canEdit ? (
          <ArchiveButton
            endpoint={`${BASE}/services/${initial.id}`}
            archived={!!initial.archivedAt}
            name={initial.name}
            kind="service"
            consequence="It won't appear in lists or when creating invoices. Past invoices keep it."
            onDone={() => onSaved?.()}
          />
        ) : null}
      </div>
      {readOnly ? <ReadOnlyNote reason={initial?.readOnlyReason ?? null} fallback="You can view services but not change them." /> : null}

      <fieldset disabled={readOnly || pending} className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Service</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <TextField id="s-name" label="Name" value={form.name} onValue={(v) => set("name", v)} error={errors.name} autoComplete="off" required />
              <div className="grid gap-5 sm:grid-cols-2">
                <TextField id="s-code" label="Service code" optional value={form.code} onValue={(v) => set("code", v)} error={errors.code} autoComplete="off" />
                <SelectField
                  id="s-category"
                  label="Category"
                  optional
                  value={form.categoryId}
                  onValue={(v) => set("categoryId", v)}
                  options={withCurrent(categoryOptions, initial?.categoryId, initial?.categoryName)}
                  noneLabel="No category"
                  error={errors.categoryId}
                />
              </div>
              <Field data-invalid={!!errors.description}>
                <FieldLabel htmlFor="s-desc">
                  Description <span className="font-normal text-muted-foreground">(optional)</span>
                </FieldLabel>
                <Textarea id="s-desc" value={form.description} onChange={(e) => set("description", e.target.value)} rows={2} aria-invalid={!!errors.description} />
                <FieldError>{errors.description}</FieldError>
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Tax and rate</CardTitle>
            <CardDescription>The rate is before GST.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField
                id="s-sac"
                label="SAC code"
                optional
                inputMode="numeric"
                maxLength={6}
                value={form.sacCode}
                onValue={(v) => set("sacCode", v.replace(/\D/g, ""))}
                error={errors.sacCode}
                hint="6 digits starting with 99, e.g. 998314."
              />
              <SelectField id="s-taxcat" label="GST treatment" value={form.taxCategory} onValue={(v) => set("taxCategory", (v || "taxable") as TaxCategoryValue)} options={TAX_CATEGORY_OPTIONS} error={errors.taxCategory} />
              {form.taxCategory === "taxable" ? <TaxRateField id="s-tax" value={form.taxRate} onValue={(v) => set("taxRate", v)} error={errors.taxRate} /> : null}
              <MoneyField id="s-rate" label="Rate" value={form.rate} onValue={(v) => set("rate", v)} error={errors.rate} />
              <SelectField
                id="s-unit"
                label="Billed per"
                optional
                value={form.unitId}
                onValue={(v) => set("unitId", v)}
                options={withCurrent(unitOptions, initial?.unitId, initial?.unitCode)}
                noneLabel="Per job"
                error={errors.unitId}
              />
            </div>
          </CardContent>
        </Card>
      </fieldset>

      {readOnly ? null : <FormActions pending={pending} submitLabel={initial ? "Save changes" : "Add service"} cancelHref="/billing/services" error={formError} />}
    </form>
  );
}

/* ---------------- Small dialog form (units, categories, price lists) ---------------- */

function DialogForm({
  open,
  onOpenChange,
  title,
  description,
  submitLabel,
  onSubmit,
  pending,
  error,
  children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  submitLabel: string;
  onSubmit: () => void;
  pending: boolean;
  error: string | null;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
          className="flex flex-col gap-5"
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description ? <DialogDescription>{description}</DialogDescription> : null}
          </DialogHeader>
          <FieldGroup>{children}</FieldGroup>
          {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
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

/** Open/close, errors and submit for a dialog that creates or edits one record. */
function useDialogSave<T>(validate: (raw: Record<string, unknown>) => { ok: true; values: unknown } | { ok: false; errors: Record<string, string> }, onSaved: (saved: T) => void) {
  const [open, setOpen] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return {
    open,
    errors,
    error,
    pending,
    show: () => {
      setErrors({});
      setError(null);
      setOpen(true);
    },
    setOpen,
    submit: (url: string, method: "POST" | "PUT", payload: Record<string, unknown>) => {
      const local = validate(payload);
      if (!local.ok) {
        setErrors(local.errors);
        return;
      }
      setErrors({});
      setError(null);
      start(async () => {
        try {
          const saved = await api<T>(url, { method, json: payload });
          setOpen(false);
          onSaved(saved);
        } catch (e) {
          setError(saveError(e, setErrors));
        }
      });
    },
  };
}

function StatusOnlyToolbar({ status, onStatus, children }: { status: ListStatus; onStatus: (s: ListStatus) => void; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <SelectField
        id="status-filter"
        label="Show"
        value={status}
        onValue={(v) => onStatus((v || "active") as ListStatus)}
        options={[
          { value: "active", label: "Active" },
          { value: "archived", label: "Archived" },
          { value: "all", label: "All" },
        ]}
        className="w-full gap-1 sm:w-36 [&>label]:sr-only"
      />
      {children}
    </div>
  );
}

/* ---------------- Units ---------------- */

export function UnitsView() {
  const [status, setStatus] = useState<ListStatus>("active");
  const query = useApiQuery<Listed<Unit>>(`${BASE}/units?status=${status}`);
  const [editing, setEditing] = useState<Unit | null>(null);
  const [form, setForm] = useState({ code: "", name: "", decimalPlaces: "0" });
  const dialog = useDialogSave<Unit>(validateUnit, () => query.reload());
  const canEdit = query.data?.canEdit ?? false;

  const openFor = (u: Unit | null) => {
    setEditing(u);
    setForm({ code: u?.code ?? "", name: u?.name ?? "", decimalPlaces: String(u?.decimalPlaces ?? 0) });
    dialog.show();
  };

  return (
    <div className="flex flex-col gap-4">
      <CatalogueNav />
      <StatusOnlyToolbar status={status} onStatus={setStatus}>
        {canEdit ? (
          <Button onClick={() => openFor(null)}>
            <PlusIcon data-icon="inline-start" />
            Add unit
          </Button>
        ) : null}
      </StatusOnlyToolbar>
      {query.data && !canEdit ? <ReadOnlyNote reason={query.data.readOnlyReason} /> : null}
      {query.status === "loading" ? (
        <ListSkeleton />
      ) : !query.data ? (
        <LoadError message={query.error.message} onRetry={query.reload} />
      ) : query.data.items.length === 0 ? (
        <EmptyList Icon={RulerIcon} title="No units" description="Units say how you count what you sell: pieces, kilograms, hours." filtered={status !== "active"} />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Decimals</TableHead>
                <TableHead className="hidden sm:table-cell">Used by</TableHead>
                {canEdit ? <TableHead><span className="sr-only">Actions</span></TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.items.map((u) => (
                <TableRow key={u.id} className={u.archivedAt ? "text-muted-foreground" : undefined}>
                  <TableCell className="font-mono text-xs">{u.code}</TableCell>
                  <TableCell>
                    <span className="flex items-center gap-2">
                      {u.name}
                      {u.archivedAt ? <ArchivedBadge /> : null}
                    </span>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{u.decimalPlaces}</TableCell>
                  <TableCell className="hidden sm:table-cell">{u.usedBy ? `${u.usedBy} item${u.usedBy === 1 ? "" : "s"}` : "—"}</TableCell>
                  {canEdit ? (
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        {u.archivedAt ? null : (
                          <Button variant="ghost" size="sm" onClick={() => openFor(u)} aria-label={`Edit ${u.name}`}>
                            <PencilIcon />
                          </Button>
                        )}
                        <ArchiveButton
                          endpoint={`${BASE}/units/${u.id}`}
                          archived={!!u.archivedAt}
                          name={u.name}
                          kind="unit"
                          consequence="Items already using it keep it, but it can't be picked for new ones."
                          onDone={query.reload}
                          size="sm"
                        />
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <DialogForm
        open={dialog.open}
        onOpenChange={dialog.setOpen}
        title={editing ? `Edit ${editing.name}` : "Add unit"}
        description="Use the GST unit code (UQC) where one exists, e.g. NOS, KGS, MTR."
        submitLabel={editing ? "Save" : "Add unit"}
        pending={dialog.pending}
        error={dialog.error}
        onSubmit={() =>
          dialog.submit(editing ? `${BASE}/units/${editing.id}` : `${BASE}/units`, editing ? "PUT" : "POST", { ...form, decimalPlaces: Number(form.decimalPlaces) })
        }
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField id="u-code" label="Code" value={form.code} onValue={(v) => setForm((f) => ({ ...f, code: v.toUpperCase() }))} error={dialog.errors.code} maxLength={10} autoComplete="off" />
          <TextField id="u-name" label="Name" value={form.name} onValue={(v) => setForm((f) => ({ ...f, name: v }))} error={dialog.errors.name} autoComplete="off" />
        </div>
        <SelectField
          id="u-dec"
          label="Decimal places"
          value={form.decimalPlaces}
          onValue={(v) => setForm((f) => ({ ...f, decimalPlaces: v || "0" }))}
          options={["0", "1", "2", "3"].map((d) => ({ value: d, label: d === "0" ? "0 (whole numbers)" : d }))}
          error={dialog.errors.decimalPlaces}
          hint="How precise quantities can be, e.g. 3 for 1.250 kg."
        />
      </DialogForm>
    </div>
  );
}

/* ---------------- Categories ---------------- */

export function CategoriesView() {
  const [status, setStatus] = useState<ListStatus>("active");
  const query = useApiQuery<Listed<Category>>(`${BASE}/categories?status=${status}`);
  const all = useApiQuery<Listed<Category>>(`${BASE}/categories`);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState({ name: "", parentId: "" });
  const reload = () => {
    query.reload();
    all.reload();
  };
  const dialog = useDialogSave<Category>(validateCategory, reload);
  const canEdit = query.data?.canEdit ?? false;

  const openFor = (c: Category | null) => {
    setEditing(c);
    setForm({ name: c?.name ?? "", parentId: c?.parentId ?? "" });
    dialog.show();
  };
  // A category can't go under itself or anything beneath it.
  const parentOptions = (all.data?.items ?? [])
    .filter((c) => !editing || (c.id !== editing.id && !c.path.startsWith(`${editing.path} / `)))
    .map((c) => ({ value: c.id, label: c.path }));

  return (
    <div className="flex flex-col gap-4">
      <CatalogueNav />
      <StatusOnlyToolbar status={status} onStatus={setStatus}>
        {canEdit ? (
          <Button onClick={() => openFor(null)}>
            <PlusIcon data-icon="inline-start" />
            Add category
          </Button>
        ) : null}
      </StatusOnlyToolbar>
      {query.data && !canEdit ? <ReadOnlyNote reason={query.data.readOnlyReason} /> : null}
      {query.status === "loading" ? (
        <ListSkeleton />
      ) : !query.data ? (
        <LoadError message={query.error.message} onRetry={query.reload} />
      ) : query.data.items.length === 0 ? (
        <EmptyList
          Icon={FolderTreeIcon}
          title="No categories yet"
          description="Group products and services, e.g. Electronics / Phones. Categories can sit inside each other."
          filtered={status !== "active"}
          action={canEdit ? <Button onClick={() => openFor(null)}><PlusIcon data-icon="inline-start" />Add category</Button> : undefined}
        />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead className="hidden sm:table-cell">Items</TableHead>
                {canEdit ? <TableHead><span className="sr-only">Actions</span></TableHead> : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.items.map((c) => (
                <TableRow key={c.id} className={c.archivedAt ? "text-muted-foreground" : undefined}>
                  <TableCell>
                    <span className="flex flex-wrap items-center gap-2">
                      {c.path.includes(" / ") ? <span className="text-muted-foreground">{c.path.slice(0, c.path.lastIndexOf(" / ") + 3)}</span> : null}
                      <span className="-ml-2 font-medium first:ml-0">{c.name}</span>
                      {c.archivedAt ? <ArchivedBadge /> : null}
                    </span>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{c.itemCount || "—"}</TableCell>
                  {canEdit ? (
                    <TableCell>
                      <div className="flex justify-end gap-2">
                        {c.archivedAt ? null : (
                          <Button variant="ghost" size="sm" onClick={() => openFor(c)} aria-label={`Edit ${c.name}`}>
                            <PencilIcon />
                          </Button>
                        )}
                        <ArchiveButton
                          endpoint={`${BASE}/categories/${c.id}`}
                          archived={!!c.archivedAt}
                          name={c.name}
                          kind="category"
                          consequence="Items in it keep it, but it can't be picked for new ones."
                          onDone={reload}
                          size="sm"
                        />
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <DialogForm
        open={dialog.open}
        onOpenChange={dialog.setOpen}
        title={editing ? `Edit ${editing.name}` : "Add category"}
        submitLabel={editing ? "Save" : "Add category"}
        pending={dialog.pending}
        error={dialog.error}
        onSubmit={() =>
          dialog.submit(editing ? `${BASE}/categories/${editing.id}` : `${BASE}/categories`, editing ? "PUT" : "POST", { name: form.name, parentId: form.parentId || null })
        }
      >
        <TextField id="cat-name" label="Name" value={form.name} onValue={(v) => setForm((f) => ({ ...f, name: v }))} error={dialog.errors.name} autoComplete="off" />
        <SelectField
          id="cat-parent"
          label="Inside"
          optional
          value={form.parentId}
          onValue={(v) => setForm((f) => ({ ...f, parentId: v }))}
          options={parentOptions}
          noneLabel="Top level"
          error={dialog.errors.parentId}
        />
      </DialogForm>
    </div>
  );
}

/* ---------------- Price lists ---------------- */

type PriceListRow = { id: string; name: string; currency: string; isDefault: boolean; archivedAt: string | null; itemCount: number; customerCount: number };
type PriceListItem = { id: string; productId: string | null; serviceId: string | null; pricePaise: number; name: string; code: string | null; basePricePaise: number; archived: boolean };
type PriceListDetail = Omit<PriceListRow, "itemCount"> & { items: PriceListItem[]; canEdit: boolean; readOnlyReason: string | null };

function PriceListDialog({ initial, open, onOpenChange, onSaved }: { initial: { id: string; name: string; isDefault: boolean } | null; open: boolean; onOpenChange: (o: boolean) => void; onSaved: (saved: PriceListDetail) => void }) {
  const [form, setForm] = useState({ name: initial?.name ?? "", isDefault: initial?.isDefault ?? false });
  const dialog = useDialogSave<PriceListDetail>(validatePriceList, onSaved);
  return (
    <DialogForm
      open={open}
      onOpenChange={onOpenChange}
      title={initial ? "Edit price list" : "Add price list"}
      description="Set special prices for some items, e.g. Wholesale or Distributor, then assign the list to customers."
      submitLabel={initial ? "Save" : "Add price list"}
      pending={dialog.pending}
      error={dialog.error}
      onSubmit={() => dialog.submit(initial ? `${BASE}/price-lists/${initial.id}` : `${BASE}/price-lists`, initial ? "PUT" : "POST", form)}
    >
      <TextField id="pl-name" label="Name" value={form.name} onValue={(v) => setForm((f) => ({ ...f, name: v }))} error={dialog.errors.name} autoComplete="off" />
      <Field orientation="horizontal" data-invalid={!!dialog.errors.isDefault}>
        <Checkbox id="pl-default" checked={form.isDefault} onCheckedChange={(c) => setForm((f) => ({ ...f, isDefault: c === true }))} />
        <div className="flex flex-col gap-1">
          <FieldLabel htmlFor="pl-default" className="font-normal">
            Default for new customers
          </FieldLabel>
          <FieldDescription>Only one price list can be the default.</FieldDescription>
          <FieldError>{dialog.errors.isDefault}</FieldError>
        </div>
      </Field>
    </DialogForm>
  );
}

export function PriceListsView() {
  const router = useRouter();
  const [status, setStatus] = useState<ListStatus>("active");
  const query = useApiQuery<Listed<PriceListRow>>(`${BASE}/price-lists?status=${status}`);
  const [open, setOpen] = useState(false);
  const canEdit = query.data?.canEdit ?? false;
  const add = (
    <Button onClick={() => setOpen(true)}>
      <PlusIcon data-icon="inline-start" />
      Add price list
    </Button>
  );

  return (
    <div className="flex flex-col gap-4">
      <CatalogueNav />
      <StatusOnlyToolbar status={status} onStatus={setStatus}>{canEdit ? add : null}</StatusOnlyToolbar>
      {query.data && !canEdit ? <ReadOnlyNote reason={query.data.readOnlyReason} /> : null}
      {query.status === "loading" ? (
        <ListSkeleton rows={3} />
      ) : !query.data ? (
        <LoadError message={query.error.message} onRetry={query.reload} />
      ) : query.data.items.length === 0 ? (
        <EmptyList
          Icon={TagsIcon}
          title="No price lists yet"
          description="Give some customers different prices, e.g. Wholesale. Items not in a list use their normal price."
          filtered={status !== "active"}
          action={canEdit ? add : undefined}
        />
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Price list</TableHead>
                <TableHead>Items</TableHead>
                <TableHead className="hidden sm:table-cell">Customers</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {query.data.items.map((p) => (
                <TableRow key={p.id} className={p.archivedAt ? "text-muted-foreground" : undefined}>
                  <TableCell>
                    <span className="flex flex-wrap items-center gap-2">
                      <Link href={`/billing/price-lists/${p.id}`} className="font-medium text-foreground hover:underline">
                        {p.name}
                      </Link>
                      {p.isDefault ? (
                        <Badge variant="outline">
                          <StarIcon data-icon="inline-start" />
                          Default
                        </Badge>
                      ) : null}
                      {p.archivedAt ? <ArchivedBadge /> : null}
                    </span>
                  </TableCell>
                  <TableCell>{p.itemCount}</TableCell>
                  <TableCell className="hidden sm:table-cell">{p.customerCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      {open ? <PriceListDialog initial={null} open onOpenChange={setOpen} onSaved={(saved) => router.push(`/billing/price-lists/${saved.id}`)} /> : null}
    </div>
  );
}

type Pickable = { id: string; name: string; sku?: string | null; code?: string | null; salePricePaise?: number; ratePaise?: number };

export function PriceListDetailView({ id }: { id: string }) {
  const query = useApiQuery<PriceListDetail>(`${BASE}/price-lists/${id}`);
  const [editOpen, setEditOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [removing, startRemove] = useTransition();
  const [removeError, setRemoveError] = useState<string | null>(null);

  if (query.status === "loading") return <Skeleton className="h-96 max-w-4xl rounded-xl" aria-label="Loading" />;
  if (!query.data) return <LoadError message={query.error.message} onRetry={query.reload} />;
  const pl = query.data;
  const editable = pl.canEdit && !pl.archivedAt;

  const remove = (itemId: string) =>
    startRemove(async () => {
      setRemoveError(null);
      try {
        await api(`${BASE}/price-lists/${pl.id}/items/${itemId}`, { method: "DELETE" });
        query.reload();
      } catch (e) {
        setRemoveError(e instanceof ApiError ? e.message : "Couldn't remove it. Try again.");
      }
    });

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <CatalogueNav />
      <BackLink href="/billing/price-lists">Back to price lists</BackLink>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
            {pl.name}
            {pl.isDefault ? <Badge variant="outline"><StarIcon data-icon="inline-start" />Default</Badge> : null}
            {pl.archivedAt ? <ArchivedBadge /> : null}
          </h2>
          <p className="text-sm text-muted-foreground">
            Used by {pl.customerCount} customer{pl.customerCount === 1 ? "" : "s"}. Items not listed use their normal price.
          </p>
        </div>
        {pl.canEdit ? (
          <div className="flex gap-2">
            {pl.archivedAt ? null : (
              <Button variant="outline" onClick={() => setEditOpen(true)}>
                <PencilIcon data-icon="inline-start" />
                Edit
              </Button>
            )}
            <ArchiveButton
              endpoint={`${BASE}/price-lists/${pl.id}`}
              archived={!!pl.archivedAt}
              name={pl.name}
              kind="price list"
              consequence="It can't be assigned to more customers. Customers already on it keep it until you change them."
              onDone={query.reload}
            />
          </div>
        ) : null}
      </div>
      {!pl.canEdit ? <ReadOnlyNote reason={pl.readOnlyReason} /> : null}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <CardTitle>Special prices</CardTitle>
            <CardDescription>Before GST.</CardDescription>
          </div>
          {editable ? (
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <PlusIcon data-icon="inline-start" />
              Add item
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          {removeError ? <p role="alert" className="mb-3 text-sm text-destructive">{removeError}</p> : null}
          {pl.items.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No special prices yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Normal price</TableHead>
                  <TableHead className="text-right">List price</TableHead>
                  {editable ? <TableHead><span className="sr-only">Actions</span></TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pl.items.map((i) => {
                  const diff = i.basePricePaise ? Math.round(((i.pricePaise - i.basePricePaise) / i.basePricePaise) * 100) : 0;
                  return (
                    <TableRow key={i.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="flex items-center gap-2 font-medium">
                            {i.name}
                            {i.archived ? <ArchivedBadge /> : null}
                          </span>
                          <span className="text-xs text-muted-foreground">{[i.productId ? "Product" : "Service", i.code].filter(Boolean).join(" · ")}</span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden text-right tabular-nums text-muted-foreground sm:table-cell">{formatPaise(i.basePricePaise)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPaise(i.pricePaise)}
                        {diff ? <span className="ml-1 text-xs text-muted-foreground">({diff > 0 ? "+" : ""}{diff}%)</span> : null}
                      </TableCell>
                      {editable ? (
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm" onClick={() => remove(i.id)} disabled={removing} aria-label={`Remove ${i.name}`}>
                            <Trash2Icon />
                          </Button>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {editOpen ? <PriceListDialog initial={pl} open onOpenChange={setEditOpen} onSaved={() => query.reload()} /> : null}
      {addOpen ? <AddPriceItemDialog priceListId={pl.id} onClose={() => setAddOpen(false)} onSaved={query.reload} /> : null}
    </div>
  );
}

function AddPriceItemDialog({ priceListId, onClose, onSaved }: { priceListId: string; onClose: () => void; onSaved: () => void }) {
  const [kind, setKind] = useState<"product" | "service">("product");
  const [itemId, setItemId] = useState("");
  const [price, setPrice] = useState("");
  const items = useApiQuery<{ items: Pickable[] }>(`${BASE}/${kind}s?pageSize=200`);
  const dialog = useDialogSave(validatePriceListItem, () => {
    onSaved();
    onClose();
  });
  const chosen = items.data?.items.find((i) => i.id === itemId);
  const base = chosen ? (chosen.salePricePaise ?? chosen.ratePaise ?? 0) : null;

  return (
    <DialogForm
      open
      onOpenChange={(o) => !o && onClose()}
      title="Add a special price"
      description="If the item is already in the list, its price is updated."
      submitLabel="Save price"
      pending={dialog.pending}
      error={dialog.error}
      onSubmit={() =>
        dialog.submit(`${BASE}/price-lists/${priceListId}/items`, "POST", {
          productId: kind === "product" ? itemId || null : null,
          serviceId: kind === "service" ? itemId || null : null,
          price,
        })
      }
    >
      <SelectField
        id="pli-kind"
        label="Type"
        value={kind}
        onValue={(v) => {
          setKind((v || "product") as "product" | "service");
          setItemId("");
        }}
        options={[
          { value: "product", label: "Product" },
          { value: "service", label: "Service" },
        ]}
      />
      <SelectField
        id="pli-item"
        label={kind === "product" ? "Product" : "Service"}
        value={itemId}
        onValue={setItemId}
        options={(items.data?.items ?? []).map((i) => ({ value: i.id, label: [i.name, i.sku ?? i.code].filter(Boolean).join(" · ") }))}
        placeholder={items.status === "loading" ? "Loading…" : items.data?.items.length ? "Choose one" : `No active ${kind}s yet`}
        error={dialog.errors.item}
      />
      <MoneyField
        id="pli-price"
        label="Price in this list"
        value={price}
        onValue={setPrice}
        error={dialog.errors.price}
        hint={base !== null ? `Normal price: ${formatPaise(base)}` : undefined}
      />
    </DialogForm>
  );
}
