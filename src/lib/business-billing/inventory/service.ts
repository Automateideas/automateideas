import { and, asc, count, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";

import { billingSettings, products, stockAdjustmentItems, stockAdjustments, stockMovements, warehouses } from "@/db/schema";

import { todayInIndia } from "../documents/types";
import { allocateDocumentNumber } from "../numbering";
import { type ListQuery, conflict, guardUnique, invalid, notFound, paged, searchFilter, uniqueViolation, where } from "../records";
import { type TenantTx, withTenant } from "../tenant-db";
import { type AdjustmentValues, type WarehouseValues, averageCost, fromMilli, showQty, toMilli, valueOf } from "./validation";

// Inventory: warehouses, the stock movement log, and the events that write to it.
//
// Stock changes only through movements (drizzle/*_inventory_rls_and_locks makes them
// permanent). Business events post them in their own transaction:
//   invoice issued          → sale (out)          purchase bill recorded → purchase (in, at bill cost)
//   credit note (restock)   → sales_return (in)   purchase return        → purchase_return (out, at return value)
//   stock adjustment        → adjustment (±)      transfer               → transfer_out + transfer_in
// Voiding any of them posts the exact opposite movements. Only products with
// "track stock" on are affected; everything else bills exactly as before.
//
// Valuation: weighted average cost across all warehouses. A purchase adds its
// taxable cost; anything leaving takes quantity × the average at that moment.

const n = (v: unknown) => Number(v ?? 0);

/* ---------------- Warehouses ---------------- */

/** The company's default warehouse, creating "Main warehouse" on first use. */
export async function ensureDefaultWarehouse(tx: TenantTx, organizationId: string): Promise<string> {
  const [d] = await tx.select({ id: warehouses.id }).from(warehouses).where(and(eq(warehouses.organizationId, organizationId), eq(warehouses.isDefault, true)));
  if (d) return d.id;
  const taken = new Set((await tx.select({ code: warehouses.code }).from(warehouses).where(eq(warehouses.organizationId, organizationId))).map((w) => w.code));
  let code = "MAIN";
  for (let i = 2; taken.has(code); i++) code = `MAIN-${i}`;
  await tx.insert(warehouses).values({ organizationId, code, name: "Main warehouse", isDefault: true }).onConflictDoNothing();
  const [again] = await tx.select({ id: warehouses.id }).from(warehouses).where(and(eq(warehouses.organizationId, organizationId), eq(warehouses.isDefault, true)));
  return again.id;
}

async function readWarehouse(tx: TenantTx, organizationId: string, id: string) {
  const [w] = await tx.select().from(warehouses).where(and(eq(warehouses.organizationId, organizationId), eq(warehouses.id, id)));
  if (!w) notFound("warehouse");
  return w;
}

/** A warehouse that can take stock: exists and isn't archived. */
async function usableWarehouse(tx: TenantTx, organizationId: string, id: string, field: string) {
  const [w] = await tx.select({ id: warehouses.id, name: warehouses.name, archivedAt: warehouses.archivedAt }).from(warehouses).where(and(eq(warehouses.organizationId, organizationId), eq(warehouses.id, id)));
  if (!w) invalid({ [field]: "Choose a warehouse from the list." });
  if (w.archivedAt) invalid({ [field]: `${w.name} is archived. Restore it or choose another warehouse.` });
  return w;
}

export async function listWarehouses(organizationId: string, opts: { includeArchived?: boolean } = {}) {
  return withTenant(organizationId, async (tx) => {
    await ensureDefaultWarehouse(tx, organizationId);
    const { rows } = await tx.execute<Record<string, unknown>>(sql`
      select w.id, w.code, w.name, w.address_line1, w.city, w.state_code, w.postal_code, w.is_default, w.archived_at,
        coalesce(s.value, 0) as value, coalesce(s.products, 0) as products
      from warehouses w
      left join (
        select m.warehouse_id, sum(m.value_paise) as value, count(*) filter (where m.qty <> 0) as products
        from (select warehouse_id, product_id, sum(quantity) as qty, sum(value_paise) as value_paise
              from stock_movements where organization_id = ${organizationId} group by warehouse_id, product_id) m
        group by m.warehouse_id
      ) s on s.warehouse_id = w.id
      where w.organization_id = ${organizationId} ${opts.includeArchived ? sql`` : sql`and w.archived_at is null`}
      order by w.is_default desc, lower(w.name)`);
    return rows.map((r) => ({
      id: String(r.id),
      code: String(r.code),
      name: String(r.name),
      addressLine1: (r.address_line1 as string) ?? null,
      city: (r.city as string) ?? null,
      stateCode: (r.state_code as string) ?? null,
      postalCode: (r.postal_code as string) ?? null,
      isDefault: r.is_default === true,
      archived: r.archived_at !== null,
      valuePaise: n(r.value),
      productsInStock: n(r.products),
    }));
  });
}

const WAREHOUSE_UNIQUE = { warehouses_code_uq: ["code", "Another warehouse already uses this code."] } as const;

export async function createWarehouse(organizationId: string, userId: string, v: WarehouseValues) {
  return guardUnique(
    () =>
      withTenant(organizationId, async (tx) => {
        await ensureDefaultWarehouse(tx, organizationId);
        const [row] = await tx.insert(warehouses).values({ organizationId, ...v, createdBy: userId, updatedBy: userId }).returning();
        return row;
      }),
    WAREHOUSE_UNIQUE,
  );
}

export async function updateWarehouse(organizationId: string, userId: string, id: string, v: WarehouseValues) {
  return guardUnique(
    () =>
      withTenant(organizationId, async (tx) => {
        await readWarehouse(tx, organizationId, id);
        const [row] = await tx.update(warehouses).set({ ...v, updatedBy: userId }).where(and(eq(warehouses.organizationId, organizationId), eq(warehouses.id, id))).returning();
        return row;
      }),
    WAREHOUSE_UNIQUE,
  );
}

/** Makes a warehouse the default (where documents take and put stock unless told otherwise). */
export async function setDefaultWarehouse(organizationId: string, userId: string, id: string) {
  return withTenant(organizationId, async (tx) => {
    const w = await readWarehouse(tx, organizationId, id);
    if (w.archivedAt) conflict("ARCHIVED", "Restore this warehouse before making it the default.");
    await tx.update(warehouses).set({ isDefault: false, updatedBy: userId }).where(and(eq(warehouses.organizationId, organizationId), eq(warehouses.isDefault, true), ne(warehouses.id, id)));
    const [row] = await tx.update(warehouses).set({ isDefault: true, updatedBy: userId }).where(and(eq(warehouses.organizationId, organizationId), eq(warehouses.id, id))).returning();
    return row;
  });
}

/** Archive only empty, non-default warehouses. */
export async function setWarehouseArchived(organizationId: string, userId: string, id: string, archived: boolean) {
  return withTenant(organizationId, async (tx) => {
    const w = await readWarehouse(tx, organizationId, id);
    if (archived && w.isDefault) conflict("DEFAULT_WAREHOUSE", "Make another warehouse the default before archiving this one.");
    if (archived) {
      const { rows } = await tx.execute<{ n: string }>(sql`
        select count(*) as n from (select product_id from stock_movements where organization_id = ${organizationId} and warehouse_id = ${id}
          group by product_id having sum(quantity) <> 0) s`);
      if (n(rows[0]?.n) > 0) conflict("HAS_STOCK", `${w.name} still holds stock. Transfer it to another warehouse first.`);
    }
    const [row] = await tx
      .update(warehouses)
      .set({ archivedAt: archived ? (w.archivedAt ?? new Date()) : null, updatedBy: userId })
      .where(and(eq(warehouses.organizationId, organizationId), eq(warehouses.id, id)))
      .returning();
    return row;
  });
}

/* ---------------- Posting movements ---------------- */

export type MovementInput = {
  warehouseId: string;
  productId: string;
  date: string;
  kind: "purchase" | "purchase_return" | "sale" | "sales_return" | "adjustment" | "transfer_out" | "transfer_in";
  /** Signed, in thousandths: in > 0, out < 0. */
  qtyMilli: number;
  /** Signed value change in paise; omitted = quantity × current average cost. */
  valuePaise?: number;
  sourceType: string;
  sourceId: string;
  sourceLineId?: string | null;
  reversesMovementId?: string | null;
  note?: string | null;
};

export type Shortage = { productId: string; product: string; warehouseId: string; warehouse: string; availableMilli: number; neededMilli: number };

async function allowsNegativeStock(tx: TenantTx, organizationId: string) {
  const [s] = await tx.select({ allow: billingSettings.allowNegativeStock }).from(billingSettings).where(eq(billingSettings.organizationId, organizationId));
  return s?.allow ?? true;
}

/**
 * Writes movements, valuing each at the running weighted average. Locks each
 * product (in id order, so concurrent postings can't deadlock) for the rest
 * of the transaction. With `enforce`, refuses (409 INSUFFICIENT_STOCK) when an
 * outgoing line would take a warehouse below zero.
 */
export async function postMovements(tx: TenantTx, organizationId: string, inputs: MovementInput[], opts: { userId?: string | null; enforce: boolean }) {
  if (!inputs.length) return [];
  const productIds = [...new Set(inputs.map((i) => i.productId))].sort();
  for (const id of productIds) await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`stock:${organizationId}:${id}`}))`);

  const info = await tx
    .select({ id: products.id, name: products.name, cost: products.purchasePricePaise })
    .from(products)
    .where(and(eq(products.organizationId, organizationId), inArray(products.id, productIds)));
  const productOf = new Map(info.map((p) => [p.id, p]));
  const { rows: totals } = await tx.execute<{ product_id: string; qty: string; value: string }>(sql`
    select product_id, sum(quantity) as qty, sum(value_paise) as value from stock_movements
    where organization_id = ${organizationId} and product_id in (${sql.join(productIds.map((id) => sql`${id}`), sql`, `)})
    group by product_id`);
  const total = new Map(totals.map((t) => [t.product_id, { qty: toMilli(t.qty), value: n(t.value) }]));
  const { rows: levels } = await tx.execute<{ product_id: string; warehouse_id: string; qty: string }>(sql`
    select product_id, warehouse_id, sum(quantity) as qty from stock_movements
    where organization_id = ${organizationId} and product_id in (${sql.join(productIds.map((id) => sql`${id}`), sql`, `)})
    group by product_id, warehouse_id`);
  const level = new Map(levels.map((l) => [`${l.product_id}|${l.warehouse_id}`, toMilli(l.qty)]));

  const shortages: Shortage[] = [];
  const lastOut = new Map<string, number>();
  const rows = inputs.map((m) => {
    const t = total.get(m.productId) ?? { qty: 0, value: 0 };
    const avg = averageCost(t.qty, t.value, productOf.get(m.productId)?.cost ?? 0);
    let value = m.valuePaise;
    if (value === undefined) value = m.kind === "transfer_in" && lastOut.has(m.productId) ? -lastOut.get(m.productId)! : valueOf(m.qtyMilli, avg);
    if (m.kind === "transfer_out") lastOut.set(m.productId, value);
    const key = `${m.productId}|${m.warehouseId}`;
    const before = level.get(key) ?? 0;
    if (opts.enforce && m.qtyMilli < 0 && before + m.qtyMilli < 0) {
      shortages.push({ productId: m.productId, product: productOf.get(m.productId)?.name ?? "", warehouseId: m.warehouseId, warehouse: "", availableMilli: Math.max(0, before), neededMilli: -m.qtyMilli });
    }
    level.set(key, before + m.qtyMilli);
    total.set(m.productId, { qty: t.qty + m.qtyMilli, value: t.value + value });
    return {
      organizationId,
      warehouseId: m.warehouseId,
      productId: m.productId,
      movementDate: m.date,
      kind: m.kind,
      quantity: fromMilli(m.qtyMilli),
      valuePaise: value,
      sourceType: m.sourceType,
      sourceId: m.sourceId,
      sourceLineId: m.sourceLineId ?? null,
      reversesMovementId: m.reversesMovementId ?? null,
      note: m.note ?? null,
      createdBy: opts.userId ?? null,
      updatedBy: opts.userId ?? null,
    };
  });

  if (shortages.length) {
    const names = new Map((await tx.select({ id: warehouses.id, name: warehouses.name }).from(warehouses).where(eq(warehouses.organizationId, organizationId))).map((w) => [w.id, w.name]));
    for (const s of shortages) s.warehouse = names.get(s.warehouseId) ?? "";
    const first = shortages[0];
    conflict(
      "INSUFFICIENT_STOCK",
      shortages.length === 1
        ? `Not enough ${first.product} in ${first.warehouse}: ${showQty(first.availableMilli)} available, ${showQty(first.neededMilli)} needed.`
        : `Not enough stock for ${shortages.length} products in ${first.warehouse}.`,
      undefined,
      { shortages },
    );
  }
  return tx.insert(stockMovements).values(rows).returning({ id: stockMovements.id });
}

/** Posts the exact opposite of every not-yet-reversed movement of a source (a void). Never blocked by stock levels. */
export async function reverseStock(tx: TenantTx, organizationId: string, sourceType: string, sourceId: string, date: string, userId?: string | null, note?: string | null) {
  const { rows } = await tx.execute<{ id: string; warehouse_id: string; product_id: string; kind: MovementInput["kind"]; quantity: string; value_paise: string; source_line_id: string | null }>(sql`
    select m.id, m.warehouse_id, m.product_id, m.kind, m.quantity, m.value_paise, m.source_line_id
    from stock_movements m
    where m.organization_id = ${organizationId} and m.source_type = ${sourceType} and m.source_id = ${sourceId}
      and m.reverses_movement_id is null
      and not exists (select 1 from stock_movements r where r.organization_id = m.organization_id and r.reverses_movement_id = m.id)
    order by m.created_at, m.id`);
  return postMovements(
    tx,
    organizationId,
    rows.map((r) => ({
      warehouseId: r.warehouse_id,
      productId: r.product_id,
      date,
      kind: r.kind,
      qtyMilli: -toMilli(r.quantity),
      valuePaise: -n(r.value_paise),
      sourceType,
      sourceId,
      sourceLineId: r.source_line_id,
      reversesMovementId: r.id,
      note,
    })),
    { userId, enforce: false },
  );
}

/* ---------------- Document events ---------------- */

const STOCK_DOCS = {
  invoices: { items: "business_invoice_items", parent: "invoice_id", kind: "sale", sign: -1, lineCost: false },
  "credit-notes": { items: "credit_note_items", parent: "credit_note_id", kind: "sales_return", sign: 1, lineCost: false },
  "purchase-bills": { items: "purchase_bill_items", parent: "purchase_bill_id", kind: "purchase", sign: 1, lineCost: true },
  "purchase-returns": { items: "purchase_return_items", parent: "purchase_return_id", kind: "purchase_return", sign: -1, lineCost: true },
} as const;
export type StockDocument = keyof typeof STOCK_DOCS;
export const STOCK_DOCUMENTS = Object.keys(STOCK_DOCS) as StockDocument[];
export const isStockDocument = (slug: string): slug is StockDocument => slug in STOCK_DOCS;
export const stockSource = (slug: StockDocument) => `document:${slug}`;

/** The warehouse a document uses: the one chosen, else the default. Checks it's usable. */
export async function documentWarehouse(tx: TenantTx, organizationId: string, chosen: string | null | undefined) {
  if (chosen) return (await usableWarehouse(tx, organizationId, chosen, "warehouseId")).id;
  return ensureDefaultWarehouse(tx, organizationId);
}

/**
 * Stock for an issued document's tracked products. Sales and returns to the
 * supplier take stock out; bills and (restocking) credit notes put it back.
 * Outgoing stock is refused below zero only when the company turned off
 * "allow negative stock".
 */
export async function postDocumentStock(
  tx: TenantTx,
  organizationId: string,
  slug: StockDocument,
  doc: { id: string; date: string; warehouseId: string; restock?: boolean },
  userId?: string | null,
) {
  if (slug === "credit-notes" && doc.restock === false) return [];
  const d = STOCK_DOCS[slug];
  const { rows } = await tx.execute<{ id: string; product_id: string; quantity: string; taxable_paise: string }>(sql`
    select it.id, it.product_id, it.quantity, it.taxable_paise
    from ${sql.raw(d.items)} it
    join products p on p.organization_id = it.organization_id and p.id = it.product_id and p.track_inventory
    where it.organization_id = ${organizationId} and it.${sql.raw(d.parent)} = ${doc.id}
    order by it.line_no`);
  if (!rows.length) return [];
  const enforce = d.sign < 0 && !(await allowsNegativeStock(tx, organizationId));
  return postMovements(
    tx,
    organizationId,
    rows
      .filter((r) => toMilli(r.quantity) !== 0)
      .map((r) => ({
        warehouseId: doc.warehouseId,
        productId: r.product_id,
        date: doc.date,
        kind: d.kind,
        qtyMilli: d.sign * toMilli(r.quantity),
        valuePaise: d.lineCost ? d.sign * n(r.taxable_paise) : undefined,
        sourceType: stockSource(slug),
        sourceId: doc.id,
        sourceLineId: r.id,
      })),
    { userId, enforce },
  );
}

/* ---------------- Adjustments and transfers ---------------- */

async function readAdjustment(tx: TenantTx, organizationId: string, id: string) {
  const [a] = await tx.select().from(stockAdjustments).where(and(eq(stockAdjustments.organizationId, organizationId), eq(stockAdjustments.id, id)));
  if (!a) notFound("stock adjustment");
  const { rows: lines } = await tx.execute<Record<string, unknown>>(sql`
    select i.line_no, i.product_id, p.name as product, p.sku, u.code as unit, i.quantity, i.unit_cost_paise, i.note,
      coalesce((select sum(m.value_paise) from stock_movements m where m.organization_id = i.organization_id and m.source_type = 'stock_adjustment'
        and m.source_id = i.adjustment_id and m.source_line_id = i.id and m.reverses_movement_id is null and m.kind <> 'transfer_in'), 0) as value
    from stock_adjustment_items i
    join products p on p.organization_id = i.organization_id and p.id = i.product_id
    left join units u on u.organization_id = p.organization_id and u.id = p.unit_id
    where i.organization_id = ${organizationId} and i.adjustment_id = ${id}
    order by i.line_no`);
  const names = new Map(
    (await tx.select({ id: warehouses.id, name: warehouses.name }).from(warehouses).where(and(eq(warehouses.organizationId, organizationId), inArray(warehouses.id, [a.warehouseId, ...(a.toWarehouseId ? [a.toWarehouseId] : [])])))).map((w) => [w.id, w.name]),
  );
  return {
    id: a.id,
    number: a.number,
    date: a.adjustmentDate,
    kind: a.kind as "adjustment" | "transfer",
    warehouseId: a.warehouseId,
    warehouseName: names.get(a.warehouseId) ?? "",
    toWarehouseId: a.toWarehouseId,
    toWarehouseName: a.toWarehouseId ? (names.get(a.toWarehouseId) ?? "") : null,
    reason: a.reason,
    notes: a.notes,
    status: a.status,
    voidedAt: a.voidedAt,
    voidReason: a.voidReason,
    createdAt: a.createdAt,
    lines: lines.map((l) => ({
      productId: String(l.product_id),
      product: String(l.product),
      sku: (l.sku as string) ?? null,
      unit: (l.unit as string) ?? null,
      quantityMilli: toMilli(l.quantity as string),
      unitCostPaise: l.unit_cost_paise === null ? null : n(l.unit_cost_paise),
      // For transfers, the value moved (positive); for adjustments, the signed change.
      valuePaise: a.kind === "transfer" ? -n(l.value) : n(l.value),
      note: (l.note as string) ?? null,
    })),
  };
}

export type AdjustmentDetail = Awaited<ReturnType<typeof readAdjustment>>;
export const getAdjustment = (organizationId: string, id: string) => withTenant(organizationId, (tx) => readAdjustment(tx, organizationId, id));

export async function listAdjustments(organizationId: string, q: ListQuery & { kind: "adjustment" | "transfer" | null }) {
  return withTenant(organizationId, async (tx) => {
    const filter = where(
      eq(stockAdjustments.organizationId, organizationId),
      q.kind ? eq(stockAdjustments.kind, q.kind) : undefined,
      q.status === "archived" ? eq(stockAdjustments.status, "void") : q.status === "active" ? eq(stockAdjustments.status, "posted") : undefined,
      searchFilter(q.q, [stockAdjustments.number, stockAdjustments.notes]),
    );
    const [{ total }] = await tx.select({ total: count() }).from(stockAdjustments).where(filter);
    const items = await tx
      .select({
        id: stockAdjustments.id,
        number: stockAdjustments.number,
        date: stockAdjustments.adjustmentDate,
        kind: stockAdjustments.kind,
        reason: stockAdjustments.reason,
        status: stockAdjustments.status,
        warehouseId: stockAdjustments.warehouseId,
        toWarehouseId: stockAdjustments.toWarehouseId,
        lines: sql<number>`(select count(*) from stock_adjustment_items i where i.organization_id = "stock_adjustments"."organization_id" and i.adjustment_id = "stock_adjustments"."id")`.mapWith(Number),
      })
      .from(stockAdjustments)
      .where(filter)
      .orderBy(desc(stockAdjustments.adjustmentDate), desc(stockAdjustments.createdAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const names = new Map((await tx.select({ id: warehouses.id, name: warehouses.name }).from(warehouses).where(eq(warehouses.organizationId, organizationId))).map((w) => [w.id, w.name]));
    return paged(
      items.map((i) => ({ ...i, warehouseName: names.get(i.warehouseId) ?? "", toWarehouseName: i.toWarehouseId ? (names.get(i.toWarehouseId) ?? "") : null })),
      total,
      q,
    );
  });
}

/**
 * Posts a stock adjustment or transfer. With an idempotency key, a repeat of
 * the same submit returns the one already posted (`replayed: true`).
 */
export async function createAdjustment(organizationId: string, userId: string, v: AdjustmentValues, idempotencyKey: string | null) {
  const existing = async () => {
    if (!idempotencyKey) return null;
    return withTenant(organizationId, async (tx) => {
      const [a] = await tx.select({ id: stockAdjustments.id }).from(stockAdjustments).where(and(eq(stockAdjustments.organizationId, organizationId), eq(stockAdjustments.idempotencyKey, idempotencyKey)));
      return a ? { ...(await readAdjustment(tx, organizationId, a.id)), replayed: true } : null;
    });
  };
  const before = await existing();
  if (before) return before;
  try {
    return await withTenant(organizationId, async (tx) => {
      await usableWarehouse(tx, organizationId, v.warehouseId, "warehouseId");
      if (v.toWarehouseId) await usableWarehouse(tx, organizationId, v.toWarehouseId, "toWarehouseId");
      const found = await tx
        .select({ id: products.id, track: products.trackInventory, archivedAt: products.archivedAt })
        .from(products)
        .where(and(eq(products.organizationId, organizationId), inArray(products.id, v.lines.map((l) => l.productId))));
      const byId = new Map(found.map((p) => [p.id, p]));
      const errors: Record<string, string> = {};
      v.lines.forEach((l, i) => {
        const p = byId.get(l.productId);
        if (!p) errors[`lines.${i}.productId`] = "Choose a product from the list.";
        else if (!p.track) errors[`lines.${i}.productId`] = "This product doesn't track stock. Turn on \"Track stock\" on the product first.";
      });
      if (Object.keys(errors).length) invalid(errors);

      const num = await allocateDocumentNumber(tx, organizationId, { documentType: "stock_adjustment", date: new Date(`${v.date}T00:00:00Z`) });
      const [header] = await tx
        .insert(stockAdjustments)
        .values({
          organizationId,
          number: num.number,
          adjustmentDate: v.date,
          kind: v.kind,
          warehouseId: v.warehouseId,
          toWarehouseId: v.toWarehouseId,
          reason: v.reason,
          notes: v.notes,
          idempotencyKey,
          createdBy: userId,
          updatedBy: userId,
        })
        .returning({ id: stockAdjustments.id });
      const items = await tx
        .insert(stockAdjustmentItems)
        .values(
          v.lines.map((l, i) => ({
            organizationId,
            adjustmentId: header.id,
            lineNo: i + 1,
            productId: l.productId,
            quantity: fromMilli(l.quantityMilli),
            unitCostPaise: l.unitCostPaise,
            note: l.note,
            createdBy: userId,
            updatedBy: userId,
          })),
        )
        .returning({ id: stockAdjustmentItems.id, lineNo: stockAdjustmentItems.lineNo });
      const lineId = new Map(items.map((i) => [i.lineNo, i.id]));
      const base = { date: v.date, sourceType: "stock_adjustment", sourceId: header.id };
      const movements: MovementInput[] =
        v.kind === "transfer"
          ? v.lines.flatMap((l, i) => [
              { ...base, warehouseId: v.warehouseId, productId: l.productId, kind: "transfer_out" as const, qtyMilli: -l.quantityMilli, sourceLineId: lineId.get(i + 1) },
              { ...base, warehouseId: v.toWarehouseId!, productId: l.productId, kind: "transfer_in" as const, qtyMilli: l.quantityMilli, sourceLineId: lineId.get(i + 1) },
            ])
          : v.lines.map((l, i) => ({
              ...base,
              warehouseId: v.warehouseId,
              productId: l.productId,
              kind: "adjustment" as const,
              qtyMilli: l.quantityMilli,
              valuePaise: l.quantityMilli > 0 && l.unitCostPaise !== null ? valueOf(l.quantityMilli, l.unitCostPaise) : undefined,
              sourceLineId: lineId.get(i + 1),
              note: l.note,
            }));
      const removes = movements.some((m) => m.qtyMilli < 0);
      await postMovements(tx, organizationId, movements, { userId, enforce: removes && !(await allowsNegativeStock(tx, organizationId)) });
      return { ...(await readAdjustment(tx, organizationId, header.id)), replayed: false };
    });
  } catch (e) {
    if (uniqueViolation(e) === "stock_adjustments_idempotency_uq") {
      const again = await existing();
      if (again) return again;
    }
    throw e;
  }
}

/** Voids an adjustment: its movements are reversed (dated today), the record stays. */
export async function voidAdjustment(organizationId: string, userId: string, id: string, reason: string) {
  return withTenant(organizationId, async (tx) => {
    const [a] = await tx.select().from(stockAdjustments).where(and(eq(stockAdjustments.organizationId, organizationId), eq(stockAdjustments.id, id))).for("update");
    if (!a) notFound("stock adjustment");
    if (a.status === "void") conflict("ALREADY_VOID", "This adjustment is already void.");
    await reverseStock(tx, organizationId, "stock_adjustment", id, todayInIndia(), userId, `Void ${a.number}: ${reason}`);
    await tx.update(stockAdjustments).set({ status: "void", voidedAt: new Date(), voidReason: reason, updatedBy: userId }).where(and(eq(stockAdjustments.organizationId, organizationId), eq(stockAdjustments.id, id)));
    return readAdjustment(tx, organizationId, id);
  });
}

/* ---------------- Stock levels ---------------- */

export type StockStatus = "ok" | "low" | "out" | "negative";
export const stockStatus = (onHandMilli: number, minMilli: number | null): StockStatus =>
  onHandMilli < 0 ? "negative" : onHandMilli === 0 ? "out" : minMilli !== null && onHandMilli < minMilli ? "low" : "ok";

export type StockQuery = { q: string | null; warehouseId: string | null; asOf: string | null; status: "all" | "attention" | StockStatus; page: number; pageSize: number };

/** Tracked products with quantity, value and status (all warehouses, or one), as of a date. */
export async function stockSummary(organizationId: string, q: StockQuery) {
  return withTenant(organizationId, async (tx) => {
    const pattern = q.q ? `%${q.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
    const { rows } = await tx.execute<Record<string, unknown>>(sql`
      select p.id, p.name, p.sku, p.min_stock_qty, p.purchase_price_paise, p.archived_at, u.code as unit,
        coalesce(s.qty, 0) as qty, coalesce(s.value, 0) as value, coalesce(t.qty, 0) as total_qty, coalesce(t.value, 0) as total_value
      from products p
      left join units u on u.organization_id = p.organization_id and u.id = p.unit_id
      left join (
        select product_id, sum(quantity) as qty, sum(value_paise) as value from stock_movements
        where organization_id = ${organizationId} ${q.warehouseId ? sql`and warehouse_id = ${q.warehouseId}` : sql``} ${q.asOf ? sql`and movement_date <= ${q.asOf}` : sql``}
        group by product_id
      ) s on s.product_id = p.id
      left join (
        select product_id, sum(quantity) as qty, sum(value_paise) as value from stock_movements
        where organization_id = ${organizationId} ${q.asOf ? sql`and movement_date <= ${q.asOf}` : sql``}
        group by product_id
      ) t on t.product_id = p.id
      where p.organization_id = ${organizationId} and p.track_inventory
        and (p.archived_at is null or coalesce(s.qty, 0) <> 0)
        ${pattern ? sql`and (p.name ilike ${pattern} or p.sku ilike ${pattern})` : sql``}
      order by lower(p.name)`);
    const all = rows.map((r) => {
      const qty = toMilli(r.qty as string);
      const totalQty = toMilli(r.total_qty as string);
      const avg = averageCost(totalQty, n(r.total_value), n(r.purchase_price_paise));
      // One warehouse: value its quantity at the company-wide average.
      const value = q.warehouseId ? valueOf(qty, avg) : n(r.value);
      const min = r.min_stock_qty === null ? null : toMilli(r.min_stock_qty as string);
      return {
        id: String(r.id),
        name: String(r.name),
        sku: (r.sku as string) ?? null,
        unit: (r.unit as string) ?? null,
        archived: r.archived_at !== null,
        onHandMilli: qty,
        valuePaise: value,
        avgCostPaise: Math.round(avg * 100) / 100,
        minStockMilli: min,
        // Low-stock status is company-wide (the minimum is set per product).
        status: stockStatus(q.warehouseId ? totalQty : qty, min),
      };
    });
    const totals = {
      products: all.length,
      valuePaise: all.reduce((a, r) => a + r.valuePaise, 0),
      low: all.filter((r) => r.status === "low").length,
      out: all.filter((r) => r.status === "out" || r.status === "negative").length,
    };
    const filtered = q.status === "all" ? all : q.status === "attention" ? all.filter((r) => r.status !== "ok") : all.filter((r) => r.status === q.status);
    const items = filtered.slice((q.page - 1) * q.pageSize, q.page * q.pageSize);
    return { items, total: filtered.length, page: q.page, pageSize: q.pageSize, totals };
  });
}

/** Tracked products below their minimum or out of stock (for the dashboard and alerts). */
export async function lowStock(organizationId: string, limit = 10) {
  const s = await stockSummary(organizationId, { q: null, warehouseId: null, asOf: null, status: "attention", page: 1, pageSize: limit });
  return { items: s.items, total: s.total };
}

/** One product's stock by warehouse and its movement history (newest first, with a running quantity). */
export async function productStock(organizationId: string, productId: string, opts: { warehouseId?: string | null; limit?: number } = {}) {
  return withTenant(organizationId, async (tx) => {
    const [p] = await tx
      .select({ id: products.id, name: products.name, sku: products.sku, track: products.trackInventory, min: products.minStockQty, cost: products.purchasePricePaise })
      .from(products)
      .where(and(eq(products.organizationId, organizationId), eq(products.id, productId)));
    if (!p) notFound("product");
    const { rows: byWarehouse } = await tx.execute<Record<string, unknown>>(sql`
      select w.id, w.name, w.code, w.is_default, coalesce(sum(m.quantity), 0) as qty
      from warehouses w
      left join stock_movements m on m.organization_id = w.organization_id and m.warehouse_id = w.id and m.product_id = ${productId}
      where w.organization_id = ${organizationId} and (w.archived_at is null or m.id is not null)
      group by w.id, w.name, w.code, w.is_default
      order by w.is_default desc, lower(w.name)`);
    const { rows: tot } = await tx.execute<{ qty: string; value: string }>(sql`
      select coalesce(sum(quantity), 0) as qty, coalesce(sum(value_paise), 0) as value from stock_movements
      where organization_id = ${organizationId} and product_id = ${productId}`);
    const totalQty = toMilli(tot[0]?.qty);
    const avg = averageCost(totalQty, n(tot[0]?.value), p.cost);
    const { rows: moves } = await tx.execute<Record<string, unknown>>(sql`
      select * from (
        select m.id, m.movement_date, m.kind, m.quantity, m.value_paise, m.source_type, m.source_id, m.reverses_movement_id, m.note, m.created_at,
          w.name as warehouse,
          sum(m.quantity) over (order by m.movement_date, m.created_at, m.id) as running,
          coalesce(i.number, cn.number, pb.number, pr.number, sa.number) as source_number
        from stock_movements m
        join warehouses w on w.organization_id = m.organization_id and w.id = m.warehouse_id
        left join business_invoices i on m.source_type = 'document:invoices' and i.organization_id = m.organization_id and i.id = m.source_id
        left join credit_notes cn on m.source_type = 'document:credit-notes' and cn.organization_id = m.organization_id and cn.id = m.source_id
        left join purchase_bills pb on m.source_type = 'document:purchase-bills' and pb.organization_id = m.organization_id and pb.id = m.source_id
        left join purchase_returns pr on m.source_type = 'document:purchase-returns' and pr.organization_id = m.organization_id and pr.id = m.source_id
        left join stock_adjustments sa on m.source_type = 'stock_adjustment' and sa.organization_id = m.organization_id and sa.id = m.source_id
        where m.organization_id = ${organizationId} and m.product_id = ${productId} ${opts.warehouseId ? sql`and m.warehouse_id = ${opts.warehouseId}` : sql``}
      ) x order by x.movement_date desc, x.created_at desc, x.id desc
      limit ${opts.limit ?? 200}`);
    return {
      product: { id: p.id, name: p.name, sku: p.sku, trackInventory: p.track, minStockMilli: p.min === null ? null : toMilli(p.min) },
      onHandMilli: totalQty,
      valuePaise: n(tot[0]?.value),
      avgCostPaise: Math.round(avg * 100) / 100,
      status: stockStatus(totalQty, p.min === null ? null : toMilli(p.min)),
      warehouses: byWarehouse.map((w) => ({ id: String(w.id), name: String(w.name), code: String(w.code), isDefault: w.is_default === true, onHandMilli: toMilli(w.qty as string) })),
      movements: moves.map((m) => ({
        id: String(m.id),
        date: typeof m.movement_date === "string" ? m.movement_date : isoDay(m.movement_date as Date),
        kind: String(m.kind),
        quantityMilli: toMilli(m.quantity as string),
        valuePaise: n(m.value_paise),
        warehouse: String(m.warehouse),
        sourceType: String(m.source_type),
        sourceId: String(m.source_id),
        sourceNumber: (m.source_number as string) ?? null,
        reversal: m.reverses_movement_id !== null,
        note: (m.note as string) ?? null,
        runningMilli: opts.warehouseId ? null : toMilli(m.running as string),
      })),
    };
  });
}

const isoDay = (v: Date) => `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;

/** Quantity on hand per product in one warehouse (for the document editor's hints). */
export async function availableStock(organizationId: string, warehouseId: string | null) {
  return withTenant(organizationId, async (tx) => {
    const wid = warehouseId ?? (await ensureDefaultWarehouse(tx, organizationId));
    const { rows } = await tx.execute<{ product_id: string; qty: string }>(sql`
      select p.id as product_id, coalesce(sum(m.quantity), 0) as qty
      from products p
      left join stock_movements m on m.organization_id = p.organization_id and m.product_id = p.id and m.warehouse_id = ${wid}
      where p.organization_id = ${organizationId} and p.track_inventory and p.archived_at is null
      group by p.id`);
    return { warehouseId: wid, stock: Object.fromEntries(rows.map((r) => [r.product_id, toMilli(r.qty)])) as Record<string, number> };
  });
}

/** Active warehouses for pickers (the default first). */
export async function warehouseOptions(tx: TenantTx, organizationId: string) {
  await ensureDefaultWarehouse(tx, organizationId);
  return tx
    .select({ id: warehouses.id, code: warehouses.code, name: warehouses.name, isDefault: warehouses.isDefault })
    .from(warehouses)
    .where(and(eq(warehouses.organizationId, organizationId), isNull(warehouses.archivedAt)))
    .orderBy(desc(warehouses.isDefault), asc(warehouses.name));
}

/* ---------------- Settings ---------------- */

export async function inventorySettings(organizationId: string) {
  return withTenant(organizationId, async (tx) => {
    const [s] = await tx.select({ allow: billingSettings.allowNegativeStock }).from(billingSettings).where(eq(billingSettings.organizationId, organizationId));
    return { configured: !!s, allowNegativeStock: s?.allow ?? true };
  });
}

/** Whether invoices, returns and adjustments may take stock below zero. */
export async function setInventorySettings(organizationId: string, userId: string, v: { allowNegativeStock: boolean }) {
  await withTenant(organizationId, async (tx) => {
    const done = await tx
      .update(billingSettings)
      .set({ allowNegativeStock: v.allowNegativeStock, updatedBy: userId, updatedAt: new Date() })
      .where(eq(billingSettings.organizationId, organizationId))
      .returning({ id: billingSettings.organizationId });
    if (!done.length) conflict("NOT_SET_UP", "Save your company details first.");
  });
  return inventorySettings(organizationId);
}
