"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRightLeftIcon, BanIcon, BoxesIcon, PencilIcon, PlusIcon, StarIcon, Trash2Icon, Undo2Icon, WarehouseIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { ApiError, api, useApiQuery } from "@/lib/api";
import { todayInIndia } from "@/lib/business-billing/documents/types";
import { formatPaise } from "@/lib/business-billing/fields";
import { ADJUSTMENT_REASONS, ADJUSTMENT_REASON_LABELS, type AdjustmentReason, validateAdjustment, validateWarehouse } from "@/lib/business-billing/inventory/validation";

import { LoadError } from "../../_components/page-parts";
import { SectionNav } from "../../_components/section-nav";
import { fmtDate } from "./documents/documents-ui";
import { VoidDialog, newKey, postOnce } from "./payments";
import { BackLink, EmptyList, type Errors, ListSkeleton, ListToolbar, Pager, ReadOnlyNote, STATE_OPTIONS, SelectField, TextField, focusFirstError, saveError, useRecordList } from "./records-ui";

const BASE = "/api/business-billing";
const qty = (milli: number) => (milli / 1000).toLocaleString("en-IN", { maximumFractionDigits: 3 });

export function InventoryNav() {
  return (
    <SectionNav
      label="Inventory"
      links={[
        { href: "/billing/stock", label: "Stock", matchNested: true },
        { href: "/billing/stock-adjustments", label: "Adjustments and transfers", matchNested: true },
        { href: "/billing/warehouses", label: "Warehouses" },
      ]}
    />
  );
}

type Status = "ok" | "low" | "out" | "negative";
const STATUS: Record<Status, { label: string; variant: "outline" | "secondary" | "destructive" }> = {
  ok: { label: "In stock", variant: "outline" },
  low: { label: "Low", variant: "secondary" },
  out: { label: "Out of stock", variant: "destructive" },
  negative: { label: "Below zero", variant: "destructive" },
};
export const StockBadge = ({ status }: { status: Status }) => <Badge variant={STATUS[status].variant}>{STATUS[status].label}</Badge>;

type WarehouseOption = { id: string; code: string; name: string; isDefault: boolean; archived?: boolean };
function useWarehouses(all = false) {
  return useApiQuery<{ items: (WarehouseOption & { city: string | null; addressLine1: string | null; stateCode: string | null; postalCode: string | null; valuePaise: number; productsInStock: number; archived: boolean })[]; canEdit: boolean; readOnlyReason: string | null }>(
    `${BASE}/warehouses${all ? "?status=all" : ""}`,
  );
}

/* ---------------- Stock list ---------------- */

type StockRow = { id: string; name: string; sku: string | null; unit: string | null; archived: boolean; onHandMilli: number; valuePaise: number; avgCostPaise: number; minStockMilli: number | null; status: Status };
type StockPage = { items: StockRow[]; total: number; page: number; pageSize: number; totals: { products: number; valuePaise: number; low: number; out: number }; canEdit: boolean; readOnlyReason: string | null };

const STOCK_FILTERS = [
  { value: "all", label: "All products" },
  { value: "attention", label: "Needs attention" },
  { value: "low", label: "Low" },
  { value: "out", label: "Out of stock" },
  { value: "negative", label: "Below zero" },
];

export function StockList() {
  const [warehouseId, setWarehouseId] = useState("");
  const [filter, setFilter] = useState("all");
  const list = useRecordList<StockRow>(`${BASE}/stock`, { warehouseId: warehouseId || null, stock: filter });
  const warehouses = useWarehouses();
  const q = list.query as unknown as { status: string; data?: StockPage; error: ApiError; reload: () => void };
  const t = q.data?.totals;
  return (
    <div className="flex flex-col gap-4">
      <InventoryNav />
      {t ? (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile label="Stock value" value={formatPaise(t.valuePaise)} sub={warehouseId ? "This warehouse, at average cost" : "At weighted average cost"} />
          <Tile label="Products tracked" value={String(t.products)} />
          <Tile label="Low stock" value={String(t.low)} sub="Below their minimum" onClick={() => setFilter("low")} />
          <Tile label="Out of stock" value={String(t.out)} sub="Zero or below" danger={t.out > 0} onClick={() => setFilter("out")} />
        </div>
      ) : null}
      <ListToolbar search={list.search} onSearch={list.setSearch} placeholder="Search name or SKU">
        <Select items={[{ value: "", label: "All warehouses" }, ...(warehouses.data?.items ?? []).map((w) => ({ value: w.id, label: w.name }))]} value={warehouseId} onValueChange={(v) => (setWarehouseId(String(v ?? "")), list.setPage(1))}>
          <SelectTrigger className="h-10 w-full sm:w-44" aria-label="Warehouse">
            <SelectValue placeholder="All warehouses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All warehouses</SelectItem>
            {(warehouses.data?.items ?? []).map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select items={STOCK_FILTERS} value={filter} onValueChange={(v) => v && (setFilter(String(v)), list.setPage(1))}>
          <SelectTrigger className="h-10 w-full sm:w-44" aria-label="Show">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STOCK_FILTERS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {q.data?.canEdit ? (
          <Button className="h-10" render={<Link href="/billing/stock-adjustments/create" />} nativeButton={false}>
            <PlusIcon data-icon="inline-start" />
            Adjust stock
          </Button>
        ) : null}
      </ListToolbar>
      {q.status === "loading" && !q.data ? (
        <ListSkeleton />
      ) : !q.data ? (
        <LoadError message={q.error.message} onRetry={q.reload} />
      ) : q.data.items.length === 0 ? (
        <EmptyList
          Icon={BoxesIcon}
          title="No products track stock yet"
          description="Open a product and tick “Track stock”. Its purchases, sales and returns then move stock automatically."
          filtered={!!list.search || filter !== "all" || !!warehouseId}
          action={
            <Button variant="outline" render={<Link href="/billing/products" />} nativeButton={false}>
              Go to products
            </Button>
          }
        />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">On hand</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Minimum</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Value</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.data.items.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link href={`/billing/stock/${r.id}`} className="font-medium hover:underline">
                        {r.name}
                      </Link>
                      {r.sku ? <span className="block text-xs text-muted-foreground">{r.sku}</span> : null}
                    </TableCell>
                    <TableCell className={`text-right tabular-nums ${r.onHandMilli < 0 ? "text-destructive" : ""}`}>
                      {qty(r.onHandMilli)} {r.unit ? <span className="text-xs text-muted-foreground">{r.unit}</span> : null}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">{r.minStockMilli === null ? "—" : qty(r.minStockMilli)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">{formatPaise(r.valuePaise)}</TableCell>
                    <TableCell>
                      <StockBadge status={r.status} />
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

function Tile({ label, value, sub, danger, onClick }: { label: string; value: string; sub?: string; danger?: boolean; onClick?: () => void }) {
  const body = (
    <>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${danger ? "text-destructive" : ""}`}>{value}</p>
      {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="rounded-xl border p-4 text-left transition-colors hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
      {body}
    </button>
  ) : (
    <div className="rounded-xl border p-4">{body}</div>
  );
}

/* ---------------- One product ---------------- */

type ProductStock = {
  product: { id: string; name: string; sku: string | null; trackInventory: boolean; minStockMilli: number | null };
  onHandMilli: number;
  valuePaise: number;
  avgCostPaise: number;
  status: Status;
  warehouses: { id: string; name: string; code: string; isDefault: boolean; onHandMilli: number }[];
  movements: { id: string; date: string; kind: string; quantityMilli: number; valuePaise: number; warehouse: string; sourceType: string; sourceId: string; sourceNumber: string | null; reversal: boolean; note: string | null; runningMilli: number | null }[];
};

const KIND_LABELS: Record<string, string> = {
  purchase: "Purchase",
  purchase_return: "Return to supplier",
  sale: "Sale",
  sales_return: "Sales return",
  adjustment: "Adjustment",
  transfer_out: "Transfer out",
  transfer_in: "Transfer in",
};
const sourceHref = (type: string, id: string) => (type === "stock_adjustment" ? `/billing/stock-adjustments/${id}` : type.startsWith("document:") ? `/billing/${type.slice("document:".length)}/${id}` : null);

export function ProductStockView({ id }: { id: string }) {
  const q = useApiQuery<ProductStock>(`${BASE}/stock/${id}`);
  if (q.status === "loading") return <Skeleton className="h-72 rounded-xl" aria-label="Loading" />;
  if (!q.data) return <LoadError message={q.error.message} onRetry={q.reload} />;
  const d = q.data;
  return (
    <div className="flex flex-col gap-4">
      <BackLink href="/billing/stock">Stock</BackLink>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">{d.product.name}</h2>
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            {d.product.sku ? <span>{d.product.sku}</span> : null}
            <StockBadge status={d.status} />
            <Link href={`/billing/products/${d.product.id}`} className="underline underline-offset-2">
              Edit product
            </Link>
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" render={<Link href={`/billing/stock-adjustments/create?kind=transfer&productId=${d.product.id}`} />} nativeButton={false}>
            <ArrowRightLeftIcon data-icon="inline-start" />
            Transfer
          </Button>
          <Button render={<Link href={`/billing/stock-adjustments/create?productId=${d.product.id}`} />} nativeButton={false}>
            Adjust stock
          </Button>
        </div>
      </div>
      {!d.product.trackInventory ? (
        <Alert>
          <AlertTitle>Stock isn&apos;t tracked for this product</AlertTitle>
          <AlertDescription>Turn on “Track stock” on the product so purchases and sales move its stock.</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-3">
        <Tile label="On hand" value={qty(d.onHandMilli)} sub={d.product.minStockMilli !== null ? `Minimum ${qty(d.product.minStockMilli)}` : "No minimum set"} danger={d.onHandMilli < 0} />
        <Tile label="Stock value" value={formatPaise(d.valuePaise)} />
        <Tile label="Average cost" value={formatPaise(Math.round(d.avgCostPaise))} sub="Per unit, before GST" />
      </div>
      <Card size="sm">
        <CardHeader>
          <CardTitle>By warehouse</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col divide-y">
            {d.warehouses.map((w) => (
              <li key={w.id} className="flex items-center justify-between py-2 text-sm">
                <span>
                  {w.name} {w.isDefault ? <Badge variant="outline" className="ml-1">Default</Badge> : null}
                </span>
                <span className={`tabular-nums ${w.onHandMilli < 0 ? "text-destructive" : ""}`}>{qty(w.onHandMilli)}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <section aria-labelledby="history" className="flex flex-col gap-2">
        <h3 id="history" className="font-medium">
          History
        </h3>
        {d.movements.length === 0 ? (
          <p className="text-sm text-muted-foreground">No stock movements yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>What</TableHead>
                  <TableHead className="hidden md:table-cell">Warehouse</TableHead>
                  <TableHead className="text-right">In</TableHead>
                  <TableHead className="text-right">Out</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.movements.map((m) => {
                  const href = sourceHref(m.sourceType, m.sourceId);
                  return (
                    <TableRow key={m.id}>
                      <TableCell className="whitespace-nowrap">{fmtDate(m.date)}</TableCell>
                      <TableCell>
                        {KIND_LABELS[m.kind] ?? m.kind}
                        {m.reversal ? <Badge variant="secondary" className="ml-1.5">Void</Badge> : null}
                        {m.sourceNumber ? (
                          <span className="block text-xs text-muted-foreground">
                            {href ? (
                              <Link href={href} className="hover:underline">
                                {m.sourceNumber}
                              </Link>
                            ) : (
                              m.sourceNumber
                            )}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">{m.warehouse}</TableCell>
                      <TableCell className="text-right tabular-nums">{m.quantityMilli > 0 ? qty(m.quantityMilli) : ""}</TableCell>
                      <TableCell className="text-right tabular-nums">{m.quantityMilli < 0 ? qty(-m.quantityMilli) : ""}</TableCell>
                      <TableCell className="text-right tabular-nums">{m.runningMilli === null ? "" : qty(m.runningMilli)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}

/* ---------------- Warehouses ---------------- */

type WarehouseRow = NonNullable<ReturnType<typeof useWarehouses>["data"]>["items"][number];

export function WarehousesView() {
  const q = useWarehouses(true);
  const [editing, setEditing] = useState<WarehouseRow | "new" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const act = (path: string, json?: unknown) =>
    start(async () => {
      setMessage(null);
      try {
        await api(path, { method: "POST", ...(json ? { json } : {}) });
        q.reload();
      } catch (e) {
        setMessage(e instanceof ApiError ? e.message : "Something went wrong. Try again.");
      }
    });
  return (
    <div className="flex flex-col gap-4">
      <InventoryNav />
      {q.status === "loading" ? (
        <ListSkeleton />
      ) : !q.data ? (
        <LoadError message={q.error.message} onRetry={q.reload} />
      ) : (
        <>
          <ReadOnlyNote reason={q.data.readOnlyReason} />
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Invoices take stock from the default warehouse, and bills put it there, unless you pick another on the document.</p>
            {q.data.canEdit ? (
              <Button size="sm" onClick={() => setEditing("new")}>
                <PlusIcon data-icon="inline-start" />
                Add warehouse
              </Button>
            ) : null}
          </div>
          {message ? (
            <p role="alert" className="text-sm text-destructive">
              {message}
            </p>
          ) : null}
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2 xl:grid-cols-3">
            {q.data.items.map((w) => (
              <li key={w.id}>
                <Card className={`h-full ${w.archived ? "opacity-70" : ""}`}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <WarehouseIcon className="size-4 text-muted-foreground" aria-hidden="true" />
                      {w.name}
                      {w.isDefault ? <Badge variant="outline">Default</Badge> : null}
                      {w.archived ? <Badge variant="secondary">Archived</Badge> : null}
                    </CardTitle>
                    <CardDescription>
                      {w.code}
                      {w.city ? ` · ${w.city}` : ""}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex flex-col gap-3">
                    <p className="text-sm">
                      <span className="font-medium tabular-nums">{formatPaise(w.valuePaise)}</span>
                      <span className="text-muted-foreground">
                        {" "}
                        · {w.productsInStock} product{w.productsInStock === 1 ? "" : "s"} in stock
                      </span>
                    </p>
                    {q.data!.canEdit ? (
                      <div className="flex flex-wrap gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setEditing(w)}>
                          <PencilIcon data-icon="inline-start" />
                          Edit
                        </Button>
                        {!w.isDefault && !w.archived ? (
                          <Button variant="ghost" size="sm" disabled={pending} onClick={() => act(`${BASE}/warehouses/${w.id}/default`)}>
                            <StarIcon data-icon="inline-start" />
                            Make default
                          </Button>
                        ) : null}
                        {!w.isDefault ? (
                          <Button variant="ghost" size="sm" disabled={pending} onClick={() => act(`${BASE}/warehouses/${w.id}/archive`, { archived: !w.archived })}>
                            {w.archived ? <Undo2Icon data-icon="inline-start" /> : <Trash2Icon data-icon="inline-start" />}
                            {w.archived ? "Restore" : "Archive"}
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </>
      )}
      {editing ? (
        <WarehouseDialog
          warehouse={editing === "new" ? null : editing}
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

function WarehouseDialog({ warehouse, onClose, onSaved }: { warehouse: WarehouseRow | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    code: warehouse?.code ?? "",
    name: warehouse?.name ?? "",
    addressLine1: warehouse?.addressLine1 ?? "",
    city: warehouse?.city ?? "",
    stateCode: warehouse?.stateCode ?? "",
    postalCode: warehouse?.postalCode ?? "",
  });
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            const v = validateWarehouse(form);
            if (!v.ok) {
              setErrors(v.errors);
              focusFirstError();
              return;
            }
            start(async () => {
              setMessage(null);
              try {
                await api(warehouse ? `${BASE}/warehouses/${warehouse.id}` : `${BASE}/warehouses`, { method: warehouse ? "PUT" : "POST", json: form });
                onSaved();
              } catch (err) {
                setMessage(saveError(err, setErrors));
              }
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>{warehouse ? "Edit warehouse" : "Add a warehouse"}</DialogTitle>
            <DialogDescription>A godown, shop or store room where you keep stock.</DialogDescription>
          </DialogHeader>
          <FieldGroup className="my-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <TextField id="wh-code" label="Code" value={form.code} onValue={(v) => set("code", v.toUpperCase())} error={errors.code} autoComplete="off" />
              <TextField id="wh-name" label="Name" value={form.name} onValue={(v) => set("name", v)} error={errors.name} className="sm:col-span-2" />
            </div>
            <TextField id="wh-address" label="Address" optional value={form.addressLine1} onValue={(v) => set("addressLine1", v)} error={errors.addressLine1} />
            <div className="grid gap-4 sm:grid-cols-3">
              <TextField id="wh-city" label="City" optional value={form.city} onValue={(v) => set("city", v)} error={errors.city} />
              <SelectField id="wh-state" label="State" optional value={form.stateCode} onValue={(v) => set("stateCode", v)} options={STATE_OPTIONS} noneLabel="—" error={errors.stateCode} />
              <TextField id="wh-pin" label="PIN code" optional inputMode="numeric" maxLength={6} value={form.postalCode} onValue={(v) => set("postalCode", v.replace(/\D/g, ""))} error={errors.postalCode} />
            </div>
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
              {warehouse ? "Save" : "Add warehouse"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Adjustments ---------------- */

type AdjustmentRow = { id: string; number: string; date: string; kind: "adjustment" | "transfer"; reason: AdjustmentReason | null; status: string; warehouseName: string; toWarehouseName: string | null; lines: number };

const KIND_FILTERS = [
  { value: "", label: "Adjustments and transfers" },
  { value: "adjustment", label: "Adjustments" },
  { value: "transfer", label: "Transfers" },
];

export function AdjustmentsList() {
  const [kind, setKind] = useState("");
  const list = useRecordList<AdjustmentRow>(`${BASE}/stock-adjustments`, { kind: kind || null });
  const q = list.query;
  return (
    <div className="flex flex-col gap-4">
      <InventoryNav />
      <ListToolbar search={list.search} onSearch={list.setSearch} placeholder="Search number or notes">
        <Select items={KIND_FILTERS} value={kind} onValueChange={(v) => (setKind(String(v ?? "")), list.setPage(1))}>
          <SelectTrigger className="h-10 w-full sm:w-56" aria-label="Show">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {KIND_FILTERS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {q.data?.canEdit ? (
          <>
            <Button variant="outline" className="h-10" render={<Link href="/billing/stock-adjustments/create?kind=transfer" />} nativeButton={false}>
              <ArrowRightLeftIcon data-icon="inline-start" />
              Transfer
            </Button>
            <Button className="h-10" render={<Link href="/billing/stock-adjustments/create" />} nativeButton={false}>
              <PlusIcon data-icon="inline-start" />
              Adjust stock
            </Button>
          </>
        ) : null}
      </ListToolbar>
      {q.status === "loading" ? (
        <ListSkeleton />
      ) : !q.data ? (
        <LoadError message={q.error.message} onRetry={q.reload} />
      ) : q.data.items.length === 0 ? (
        <EmptyList Icon={BoxesIcon} title="No adjustments yet" description="Record opening stock, stock counts, damaged or lost goods, and transfers between warehouses." filtered={!!list.search || !!kind} />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Number</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>What</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Products</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {q.data.items.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <Link href={`/billing/stock-adjustments/${a.id}`} className="font-medium hover:underline">
                        {a.number}
                      </Link>
                      {a.status === "void" ? <Badge variant="secondary" className="ml-2">Void</Badge> : null}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{fmtDate(a.date)}</TableCell>
                    <TableCell>
                      {a.kind === "transfer" ? `Transfer: ${a.warehouseName} → ${a.toWarehouseName}` : `${a.reason ? ADJUSTMENT_REASON_LABELS[a.reason] : "Adjustment"} · ${a.warehouseName}`}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums sm:table-cell">{a.lines}</TableCell>
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

type Available = { warehouseId: string; stock: Record<string, number>; warehouses: WarehouseOption[]; allowNegativeStock: boolean };
type FormLine = { key: string; productId: string; direction: "add" | "remove"; quantity: string; unitCost: string; note: string };
const blank = (productId = "", direction: "add" | "remove" = "add"): FormLine => ({ key: newKey(), productId, direction, quantity: "", unitCost: "", note: "" });

export function AdjustmentForm({ kind: initialKind, productId }: { kind?: "adjustment" | "transfer"; productId?: string }) {
  const router = useRouter();
  const [kind, setKind] = useState<"adjustment" | "transfer">(initialKind ?? "adjustment");
  const [form, setForm] = useState({ date: todayInIndia(), warehouseId: "", toWarehouseId: "", reason: "count" as AdjustmentReason, notes: "" });
  const [lines, setLines] = useState<FormLine[]>(() => [blank(productId ?? "")]);
  const [errors, setErrors] = useState<Errors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [key] = useState(newKey);
  const [pending, start] = useTransition();
  const products = useApiQuery<{ items: StockRow[] }>(`${BASE}/stock?pageSize=200`);
  const available = useApiQuery<Available>(`${BASE}/stock/available${form.warehouseId ? `?warehouseId=${form.warehouseId}` : ""}`);
  const warehouseId = form.warehouseId || available.data?.warehouseId || "";
  const productOptions = useMemo(() => (products.data?.items ?? []).filter((p) => !p.archived).map((p) => ({ value: p.id, label: p.sku ? `${p.name} (${p.sku})` : p.name })), [products.data]);
  const unitOf = (id: string) => products.data?.items.find((p) => p.id === id)?.unit ?? "";
  const setLine = (i: number, patch: Partial<FormLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const warehouses = available.data?.warehouses ?? [];

  const payload = () => ({
    date: form.date,
    kind,
    warehouseId,
    toWarehouseId: kind === "transfer" ? form.toWarehouseId : null,
    reason: kind === "adjustment" ? form.reason : null,
    notes: form.notes,
    lines: lines.map((l) => ({
      productId: l.productId || null,
      quantity: l.quantity ? (kind === "adjustment" && l.direction === "remove" ? `-${l.quantity}` : l.quantity) : "",
      unitCost: kind === "adjustment" && l.direction === "add" ? l.unitCost : "",
      note: l.note,
    })),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const raw = payload();
    const v = validateAdjustment(raw);
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
        const a = await postOnce<{ id: string }>(`${BASE}/stock-adjustments`, key, raw);
        router.push(`/billing/stock-adjustments/${a.id}`);
      } catch (err) {
        setMessage(saveError(err, setErrors));
      }
    });
  };

  if (products.status === "loading" || available.status === "loading") return <ListSkeleton />;
  if (!products.data) return <LoadError message={products.error.message} onRetry={products.reload} />;
  return (
    <div className="flex flex-col gap-4">
      <BackLink href="/billing/stock-adjustments">Adjustments and transfers</BackLink>
      {productOptions.length === 0 ? (
        <Alert>
          <AlertTitle>No products track stock yet</AlertTitle>
          <AlertDescription>
            Open a product and tick “Track stock” first. <Link href="/billing/products" className="underline underline-offset-2">Go to products</Link>
          </AlertDescription>
        </Alert>
      ) : null}
      <form onSubmit={submit} noValidate className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{kind === "transfer" ? "Transfer stock" : "Adjust stock"}</CardTitle>
            <CardDescription>
              {kind === "transfer"
                ? "Move stock from one warehouse to another. Its value moves with it."
                : "Opening stock, a stock count, or goods damaged, lost or found. Sales and purchases move stock on their own; you don't need an adjustment for them."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex gap-2" role="group" aria-label="Type">
              <Button type="button" size="sm" variant={kind === "adjustment" ? "secondary" : "ghost"} aria-pressed={kind === "adjustment"} onClick={() => setKind("adjustment")}>
                Adjustment
              </Button>
              <Button type="button" size="sm" variant={kind === "transfer" ? "secondary" : "ghost"} aria-pressed={kind === "transfer"} onClick={() => setKind("transfer")} disabled={warehouses.length < 2} title={warehouses.length < 2 ? "Add a second warehouse first" : undefined}>
                Transfer
              </Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <TextField id="adj-date" label="Date" type="date" value={form.date} onValue={(v) => setForm((f) => ({ ...f, date: v }))} error={errors.date} />
              <SelectField
                id="adj-warehouse"
                label={kind === "transfer" ? "From" : "Warehouse"}
                value={warehouseId}
                onValue={(v) => setForm((f) => ({ ...f, warehouseId: v }))}
                options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
                error={errors.warehouseId}
              />
              {kind === "transfer" ? (
                <SelectField id="adj-to" label="To" value={form.toWarehouseId} onValue={(v) => setForm((f) => ({ ...f, toWarehouseId: v }))} options={warehouses.filter((w) => w.id !== warehouseId).map((w) => ({ value: w.id, label: w.name }))} error={errors.toWarehouseId} />
              ) : (
                <SelectField
                  id="adj-reason"
                  label="Reason"
                  value={form.reason}
                  onValue={(v) => {
                    const reason = (v || "count") as AdjustmentReason;
                    setForm((f) => ({ ...f, reason }));
                    if (reason === "opening" || reason === "found") setLines((ls) => ls.map((l) => ({ ...l, direction: "add" })));
                    if (["damaged", "lost", "expired", "internal_use"].includes(reason)) setLines((ls) => ls.map((l) => ({ ...l, direction: "remove" })));
                  }}
                  options={ADJUSTMENT_REASONS.map((r) => ({ value: r, label: ADJUSTMENT_REASON_LABELS[r] }))}
                  error={errors.reason}
                />
              )}
            </div>
            <Field>
              <FieldLabel htmlFor="adj-notes">
                Notes <span className="font-normal text-muted-foreground">(optional)</span>
              </FieldLabel>
              <Textarea id="adj-notes" rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </Field>
          </CardContent>
        </Card>

        <div className="overflow-x-auto rounded-xl border">
          <Table className="min-w-[720px]">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[38%]">Product</TableHead>
                <TableHead className="text-right">In stock</TableHead>
                {kind === "adjustment" ? <TableHead className="w-32">Change</TableHead> : null}
                <TableHead className="w-28 text-right">Quantity</TableHead>
                {kind === "adjustment" ? <TableHead className="w-32 text-right">Cost per unit (₹)</TableHead> : null}
                <TableHead className="w-10">
                  <span className="sr-only">Remove</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l, i) => {
                const have = l.productId ? (available.data?.stock[l.productId] ?? 0) : null;
                const change = Math.round(Number(l.quantity || 0) * 1000) * (kind === "transfer" || l.direction === "remove" ? -1 : 1);
                return (
                  <TableRow key={l.key} className="align-top">
                    <TableCell>
                      <SelectField id={`adj-p-${i}`} label={`Line ${i + 1} product`} value={l.productId} onValue={(v) => setLine(i, { productId: v })} options={productOptions} error={errors[`lines.${i}.productId`]} className="[&>label]:sr-only" />
                    </TableCell>
                    <TableCell className="pt-4 text-right text-sm tabular-nums">
                      {have === null ? "—" : (
                        <>
                          {qty(have)} {unitOf(l.productId)}
                          {l.quantity ? <span className={`block text-xs ${have + change < 0 ? "text-destructive" : "text-muted-foreground"}`}>After: {qty(have + change)}</span> : null}
                        </>
                      )}
                    </TableCell>
                    {kind === "adjustment" ? (
                      <TableCell>
                        <SelectField id={`adj-d-${i}`} label={`Line ${i + 1} change`} value={l.direction} onValue={(v) => setLine(i, { direction: (v || "add") as "add" | "remove" })} options={[{ value: "add", label: "Add" }, { value: "remove", label: "Remove" }]} className="[&>label]:sr-only" />
                      </TableCell>
                    ) : null}
                    <TableCell>
                      <Input aria-label={`Line ${i + 1} quantity`} inputMode="decimal" className="text-right tabular-nums" value={l.quantity} aria-invalid={!!errors[`lines.${i}.quantity`]} onChange={(e) => setLine(i, { quantity: e.target.value.replace(/[^\d.]/g, "") })} />
                      {errors[`lines.${i}.quantity`] ? <p className="mt-1 text-xs text-destructive">{errors[`lines.${i}.quantity`]}</p> : null}
                    </TableCell>
                    {kind === "adjustment" ? (
                      <TableCell>
                        {l.direction === "add" ? (
                          <Input aria-label={`Line ${i + 1} cost per unit`} inputMode="decimal" placeholder="Average" className="text-right tabular-nums" value={l.unitCost} onChange={(e) => setLine(i, { unitCost: e.target.value.replace(/[^\d.]/g, "") })} />
                        ) : (
                          <span className="block pt-2 text-right text-xs text-muted-foreground">At average</span>
                        )}
                        {errors[`lines.${i}.unitCost`] ? <p className="mt-1 text-xs text-destructive">{errors[`lines.${i}.unitCost`]}</p> : null}
                      </TableCell>
                    ) : null}
                    <TableCell>
                      <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove line ${i + 1}`} disabled={lines.length <= 1} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
                        <Trash2Icon />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={6}>
                  <Button type="button" variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, blank("", ls.at(-1)?.direction ?? "add")])}>
                    <PlusIcon data-icon="inline-start" />
                    Add product
                  </Button>
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
        {kind === "adjustment" ? <p className="text-xs text-muted-foreground">Cost per unit is before GST. Leave it blank to use the product&apos;s current average cost (or its purchase price if you have none in stock).</p> : null}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button type="submit" disabled={pending}>
            {pending ? <Spinner data-icon="inline-start" /> : null}
            {kind === "transfer" ? "Transfer stock" : "Save adjustment"}
          </Button>
          <Button variant="ghost" render={<Link href="/billing/stock-adjustments" />} nativeButton={false}>
            Cancel
          </Button>
          {message ? (
            <p role="alert" className="text-sm text-destructive">
              {message}
            </p>
          ) : null}
        </div>
      </form>
    </div>
  );
}

type AdjustmentDetail = {
  id: string;
  number: string;
  date: string;
  kind: "adjustment" | "transfer";
  warehouseName: string;
  toWarehouseName: string | null;
  reason: AdjustmentReason | null;
  notes: string | null;
  status: string;
  voidReason: string | null;
  lines: { productId: string; product: string; sku: string | null; unit: string | null; quantityMilli: number; unitCostPaise: number | null; valuePaise: number; note: string | null }[];
  canEdit: boolean;
  readOnlyReason: string | null;
};

export function AdjustmentView({ id }: { id: string }) {
  const q = useApiQuery<AdjustmentDetail>(`${BASE}/stock-adjustments/${id}`);
  const [voiding, setVoiding] = useState(false);
  if (q.status === "loading") return <Skeleton className="h-72 rounded-xl" aria-label="Loading" />;
  if (!q.data) return <LoadError message={q.error.message} onRetry={q.reload} />;
  const a = q.data;
  const total = a.lines.reduce((s, l) => s + l.valuePaise, 0);
  return (
    <div className="flex flex-col gap-4">
      <BackLink href="/billing/stock-adjustments">Adjustments and transfers</BackLink>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold">
            {a.number}
            {a.status === "void" ? <Badge variant="secondary" className="ml-2 align-middle">Void</Badge> : null}
          </h2>
          <p className="text-sm text-muted-foreground">
            {fmtDate(a.date)} · {a.kind === "transfer" ? `Transfer from ${a.warehouseName} to ${a.toWarehouseName}` : `${a.reason ? ADJUSTMENT_REASON_LABELS[a.reason] : "Adjustment"} in ${a.warehouseName}`}
          </p>
        </div>
        {a.canEdit && a.status !== "void" ? (
          <Button variant="outline" onClick={() => setVoiding(true)}>
            <BanIcon data-icon="inline-start" />
            Void
          </Button>
        ) : null}
      </div>
      {a.status === "void" ? (
        <Alert>
          <BanIcon />
          <AlertTitle>Void</AlertTitle>
          <AlertDescription>{a.voidReason}. Its stock changes were reversed; the record stays.</AlertDescription>
        </Alert>
      ) : null}
      {a.notes ? <p className="text-sm">{a.notes}</p> : null}
      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">{a.kind === "transfer" ? "Moved" : "Change"}</TableHead>
              <TableHead className="text-right">Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {a.lines.map((l) => (
              <TableRow key={l.productId}>
                <TableCell>
                  <Link href={`/billing/stock/${l.productId}`} className="hover:underline">
                    {l.product}
                  </Link>
                  {l.note ? <span className="block text-xs text-muted-foreground">{l.note}</span> : null}
                </TableCell>
                <TableCell className={`text-right tabular-nums ${a.kind === "adjustment" && l.quantityMilli < 0 ? "text-destructive" : ""}`}>
                  {a.kind === "adjustment" && l.quantityMilli > 0 ? "+" : ""}
                  {qty(l.quantityMilli)} {l.unit}
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatPaise(l.valuePaise)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={2}>{a.kind === "transfer" ? "Value moved" : "Change in stock value"}</TableCell>
              <TableCell className="text-right tabular-nums">{formatPaise(total)}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
      {voiding ? (
        <VoidDialog
          title={`Void ${a.number}?`}
          description="Its stock changes are reversed today. The record stays, marked void."
          path={`${BASE}/stock-adjustments/${a.id}/void`}
          placeholder="e.g. Entered twice"
          onClose={() => setVoiding(false)}
          onDone={() => {
            setVoiding(false);
            q.reload();
          }}
        />
      ) : null}
    </div>
  );
}

/* ---------------- Settings ---------------- */

export function InventorySettingsView() {
  const q = useApiQuery<{ configured: boolean; allowNegativeStock: boolean; canEdit: boolean; readOnlyReason: string | null }>(`${BASE}/inventory-settings`);
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  if (q.status === "loading") return <Skeleton className="h-40 rounded-xl" aria-label="Loading" />;
  if (!q.data) return <LoadError message={q.error.message} onRetry={q.reload} />;
  const s = q.data;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Stock rules</CardTitle>
        <CardDescription>Applies to products with “Track stock” on. Other products are never checked.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ReadOnlyNote reason={s.readOnlyReason} fallback={s.canEdit ? undefined : "Only owners and admins can change stock rules."} />
        {!s.configured ? <p className="text-sm text-muted-foreground">Save your company details first.</p> : null}
        <Field orientation="horizontal">
          <Checkbox
            id="inv-negative"
            checked={s.allowNegativeStock}
            disabled={!s.canEdit || !s.configured || pending}
            onCheckedChange={(c) =>
              start(async () => {
                setMessage(null);
                try {
                  await api(`${BASE}/inventory-settings`, { method: "PUT", json: { allowNegativeStock: c === true } });
                  q.reload();
                } catch (e) {
                  setMessage(e instanceof ApiError ? e.message : "Couldn't save. Try again.");
                }
              })
            }
          />
          <FieldLabel htmlFor="inv-negative" className="flex flex-col items-start gap-0.5 font-normal">
            <span className="font-medium">Allow selling more than is in stock</span>
            <span className="text-muted-foreground">
              On: invoices go through and stock shows below zero (handy if you bill before entering purchases). Off: an invoice, return to a supplier or adjustment that would take a warehouse below zero is refused.
            </span>
          </FieldLabel>
        </Field>
        {message ? (
          <p role="alert" className="text-sm text-destructive">
            {message}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
