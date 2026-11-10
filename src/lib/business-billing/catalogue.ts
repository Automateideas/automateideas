import { type SQL, and, asc, count, eq, isNull, ne, sql } from "drizzle-orm";

import { productCategories, products, services, units } from "@/db/schema";

import {
  type CategoryValues,
  DEFAULT_UNITS,
  type ProductValues,
  type ServiceValues,
  type UnitValues,
} from "./catalogue-validation";
import { type ListQuery, conflict, guardUnique, invalid, notFound, paged, searchFilter, statusFilter, where } from "./records";
import { type TenantTx, withTenant } from "./tenant-db";

// Units, categories, products and services of a tenant company. Archived,
// never deleted (document lines point at them). Every query filters by
// organization_id; row-level security (withTenant) is the second lock.

const byName = (col: SQL | Parameters<typeof asc>[0]) => asc(sql`lower(${col})`);

/* ---------------- Units ---------------- */

const UNIT_UNIQUE = { units_code_uq: ["code", "Another unit already uses this code."] } as const;

/** Adds the common GST units the first time a workspace has none at all. */
async function ensureDefaultUnits(tx: TenantTx, organizationId: string) {
  const [{ n }] = await tx.select({ n: count() }).from(units).where(eq(units.organizationId, organizationId));
  if (n > 0) return;
  await tx
    .insert(units)
    .values(DEFAULT_UNITS.map((u) => ({ organizationId, ...u })))
    .onConflictDoNothing();
}

export async function listUnits(organizationId: string, status: ListQuery["status"] = "active") {
  return withTenant(organizationId, async (tx) => {
    await ensureDefaultUnits(tx, organizationId);
    const used = sql<number>`(
      (select count(*) from products p where p.organization_id = "units"."organization_id" and p.unit_id = "units"."id")
      + (select count(*) from services s where s.organization_id = "units"."organization_id" and s.unit_id = "units"."id")
    )::int`;
    return tx
      .select({
        id: units.id,
        code: units.code,
        name: units.name,
        decimalPlaces: units.decimalPlaces,
        archivedAt: units.archivedAt,
        usedBy: used,
      })
      .from(units)
      .where(where(eq(units.organizationId, organizationId), statusFilter(units.archivedAt, status)))
      .orderBy(asc(units.code));
  });
}

async function readUnit(tx: TenantTx, organizationId: string, id: string) {
  const [u] = await tx.select().from(units).where(and(eq(units.organizationId, organizationId), eq(units.id, id)));
  if (!u) notFound("unit");
  return { id: u.id, code: u.code, name: u.name, decimalPlaces: u.decimalPlaces, archivedAt: u.archivedAt };
}

export async function createUnit(organizationId: string, userId: string, v: UnitValues) {
  return guardUnique(
    () =>
      withTenant(organizationId, async (tx) => {
        const [row] = await tx
          .insert(units)
          .values({ organizationId, ...v, createdBy: userId, updatedBy: userId })
          .returning({ id: units.id });
        return readUnit(tx, organizationId, row.id);
      }),
    UNIT_UNIQUE,
  );
}

export async function updateUnit(organizationId: string, userId: string, id: string, v: UnitValues) {
  return guardUnique(
    () =>
      withTenant(organizationId, async (tx) => {
        await readUnit(tx, organizationId, id);
        await tx
          .update(units)
          .set({ ...v, updatedBy: userId })
          .where(and(eq(units.organizationId, organizationId), eq(units.id, id)));
        return readUnit(tx, organizationId, id);
      }),
    UNIT_UNIQUE,
  );
}

/** Archived units stay on existing products but can't be picked for new ones. */
export async function setUnitArchived(organizationId: string, userId: string, id: string, archived: boolean) {
  return withTenant(organizationId, async (tx) => {
    await readUnit(tx, organizationId, id);
    await tx
      .update(units)
      .set({ archivedAt: archived ? new Date() : null, updatedBy: userId })
      .where(and(eq(units.organizationId, organizationId), eq(units.id, id)));
    return readUnit(tx, organizationId, id);
  });
}

/* ---------------- Categories ---------------- */

const CATEGORY_UNIQUE = {
  product_categories_name_uq: ["name", "A category with this name already exists here."],
} as const;

export async function listCategories(organizationId: string, status: ListQuery["status"] = "active") {
  return withTenant(organizationId, async (tx) => {
    const used = sql<number>`(
      (select count(*) from products p where p.organization_id = "product_categories"."organization_id" and p.category_id = "product_categories"."id" and p.archived_at is null)
      + (select count(*) from services s where s.organization_id = "product_categories"."organization_id" and s.category_id = "product_categories"."id" and s.archived_at is null)
    )::int`;
    const rows = await tx
      .select({
        id: productCategories.id,
        name: productCategories.name,
        parentId: productCategories.parentId,
        archivedAt: productCategories.archivedAt,
        itemCount: used,
      })
      .from(productCategories)
      .where(where(eq(productCategories.organizationId, organizationId), statusFilter(productCategories.archivedAt, status)))
      .orderBy(byName(productCategories.name));
    // Full path for display and pickers, e.g. "Electronics / Phones".
    const all = await tx
      .select({ id: productCategories.id, name: productCategories.name, parentId: productCategories.parentId })
      .from(productCategories)
      .where(eq(productCategories.organizationId, organizationId));
    const map = new Map(all.map((c) => [c.id, c]));
    const pathOf = (id: string) => {
      const parts: string[] = [];
      for (let c = map.get(id), i = 0; c && i < 10; c = c.parentId ? map.get(c.parentId) : undefined, i++) parts.unshift(c.name);
      return parts.join(" / ");
    };
    return rows.map((r) => ({ ...r, path: pathOf(r.id) })).sort((a, b) => a.path.localeCompare(b.path));
  });
}

async function readCategory(tx: TenantTx, organizationId: string, id: string) {
  const [c] = await tx
    .select()
    .from(productCategories)
    .where(and(eq(productCategories.organizationId, organizationId), eq(productCategories.id, id)));
  if (!c) notFound("category");
  return { id: c.id, name: c.name, parentId: c.parentId, archivedAt: c.archivedAt };
}

/** Parent must be an active category of this tenant, and not the category itself or one under it. */
async function checkParent(tx: TenantTx, organizationId: string, parentId: string | null, selfId?: string) {
  if (!parentId) return;
  if (parentId === selfId) invalid({ parentId: "A category can't be inside itself." });
  for (let id: string | null = parentId, depth = 0; id; depth++) {
    if (depth > 5) invalid({ parentId: "Categories can be at most 5 levels deep." });
    const [c] = await tx
      .select({ parentId: productCategories.parentId, archivedAt: productCategories.archivedAt })
      .from(productCategories)
      .where(and(eq(productCategories.organizationId, organizationId), eq(productCategories.id, id)));
    if (!c || (depth === 0 && c.archivedAt)) invalid({ parentId: "Choose an active category." });
    if (c.parentId === selfId && selfId) invalid({ parentId: "A category can't be inside one of its own subcategories." });
    id = c.parentId;
  }
}

export async function createCategory(organizationId: string, userId: string, v: CategoryValues) {
  return guardUnique(
    () =>
      withTenant(organizationId, async (tx) => {
        await checkParent(tx, organizationId, v.parentId);
        const [row] = await tx
          .insert(productCategories)
          .values({ organizationId, ...v, createdBy: userId, updatedBy: userId })
          .returning({ id: productCategories.id });
        return readCategory(tx, organizationId, row.id);
      }),
    CATEGORY_UNIQUE,
  );
}

export async function updateCategory(organizationId: string, userId: string, id: string, v: CategoryValues) {
  return guardUnique(
    () =>
      withTenant(organizationId, async (tx) => {
        const current = await readCategory(tx, organizationId, id);
        if (v.parentId !== current.parentId) await checkParent(tx, organizationId, v.parentId, id);
        await tx
          .update(productCategories)
          .set({ ...v, updatedBy: userId })
          .where(and(eq(productCategories.organizationId, organizationId), eq(productCategories.id, id)));
        return readCategory(tx, organizationId, id);
      }),
    CATEGORY_UNIQUE,
  );
}

export async function setCategoryArchived(organizationId: string, userId: string, id: string, archived: boolean) {
  return withTenant(organizationId, async (tx) => {
    await readCategory(tx, organizationId, id);
    await tx
      .update(productCategories)
      .set({ archivedAt: archived ? new Date() : null, updatedBy: userId })
      .where(and(eq(productCategories.organizationId, organizationId), eq(productCategories.id, id)));
    return readCategory(tx, organizationId, id);
  });
}

/* ---------------- Shared reference checks ---------------- */

/** A unit or category picked on a product/service must be active, unless it's unchanged. */
async function checkUnit(tx: TenantTx, organizationId: string, id: string | null, current?: string | null) {
  if (!id || id === current) return;
  const [u] = await tx
    .select({ id: units.id })
    .from(units)
    .where(and(eq(units.organizationId, organizationId), eq(units.id, id), isNull(units.archivedAt)));
  if (!u) invalid({ unitId: "Choose an active unit." });
}

async function checkCategory(tx: TenantTx, organizationId: string, id: string | null, current?: string | null) {
  if (!id || id === current) return;
  const [c] = await tx
    .select({ id: productCategories.id })
    .from(productCategories)
    .where(and(eq(productCategories.organizationId, organizationId), eq(productCategories.id, id), isNull(productCategories.archivedAt)));
  if (!c) invalid({ categoryId: "Choose an active category." });
}

/* ---------------- Products ---------------- */

const PRODUCT_UNIQUE = {
  products_sku_uq: ["sku", "Another product already uses this SKU."],
  products_barcode_uq: ["barcode", "Another product already uses this barcode."],
} as const;

const productFields = {
  id: products.id,
  name: products.name,
  sku: products.sku,
  barcode: products.barcode,
  description: products.description,
  brand: products.brand,
  categoryId: products.categoryId,
  categoryName: productCategories.name,
  unitId: products.unitId,
  unitCode: units.code,
  hsnCode: products.hsnCode,
  taxCategory: products.taxCategory,
  taxRate: products.taxRate,
  cessRate: products.cessRate,
  salePricePaise: products.salePricePaise,
  purchasePricePaise: products.purchasePricePaise,
  trackInventory: products.trackInventory,
  minStockQty: products.minStockQty,
  archivedAt: products.archivedAt,
  updatedAt: products.updatedAt,
};

function productQuery(tx: TenantTx) {
  return tx
    .select(productFields)
    .from(products)
    .innerJoin(units, and(eq(units.organizationId, products.organizationId), eq(units.id, products.unitId)))
    .leftJoin(
      productCategories,
      and(eq(productCategories.organizationId, products.organizationId), eq(productCategories.id, products.categoryId)),
    );
}

export async function listProducts(organizationId: string, q: ListQuery & { categoryId?: string | null }) {
  return withTenant(organizationId, async (tx) => {
    const filter = where(
      eq(products.organizationId, organizationId),
      statusFilter(products.archivedAt, q.status),
      q.categoryId ? eq(products.categoryId, q.categoryId) : undefined,
      searchFilter(q.q, [products.name, products.sku, products.barcode, products.hsnCode, products.brand]),
    );
    const [{ total }] = await tx.select({ total: count() }).from(products).where(filter);
    const rows = await productQuery(tx)
      .where(filter)
      .orderBy(byName(products.name), asc(products.id))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    return paged(rows, total, q);
  });
}

async function readProduct(tx: TenantTx, organizationId: string, id: string) {
  const [p] = await productQuery(tx).where(and(eq(products.organizationId, organizationId), eq(products.id, id)));
  if (!p) notFound("product");
  return p;
}

export async function getProduct(organizationId: string, id: string) {
  return withTenant(organizationId, (tx) => readProduct(tx, organizationId, id));
}

async function checkProductCodes(tx: TenantTx, organizationId: string, v: ProductValues, selfId?: string) {
  const notSelf = selfId ? ne(products.id, selfId) : undefined;
  for (const [key, col, value] of [["sku", products.sku, v.sku], ["barcode", products.barcode, v.barcode]] as const) {
    if (!value) continue;
    const [hit] = await tx
      .select({ name: products.name })
      .from(products)
      .where(and(eq(products.organizationId, organizationId), eq(col, value), notSelf))
      .limit(1);
    if (hit) conflict("DUPLICATE", `${hit.name} already uses this ${key === "sku" ? "SKU" : "barcode"}.`, { [key]: `${hit.name} already uses this ${key === "sku" ? "SKU" : "barcode"}.` });
  }
}

export async function createProduct(organizationId: string, userId: string, v: ProductValues) {
  return guardUnique(
    () =>
      withTenant(organizationId, async (tx) => {
        await checkUnit(tx, organizationId, v.unitId);
        await checkCategory(tx, organizationId, v.categoryId);
        await checkProductCodes(tx, organizationId, v);
        const [row] = await tx
          .insert(products)
          .values({ organizationId, ...v, createdBy: userId, updatedBy: userId })
          .returning({ id: products.id });
        return readProduct(tx, organizationId, row.id);
      }),
    PRODUCT_UNIQUE,
  );
}

export async function updateProduct(organizationId: string, userId: string, id: string, v: ProductValues) {
  return guardUnique(
    () =>
      withTenant(organizationId, async (tx) => {
        const current = await readProduct(tx, organizationId, id);
        await checkUnit(tx, organizationId, v.unitId, current.unitId);
        await checkCategory(tx, organizationId, v.categoryId, current.categoryId);
        await checkProductCodes(tx, organizationId, v, id);
        await tx
          .update(products)
          .set({ ...v, updatedBy: userId })
          .where(and(eq(products.organizationId, organizationId), eq(products.id, id)));
        return readProduct(tx, organizationId, id);
      }),
    PRODUCT_UNIQUE,
  );
}

export async function setProductArchived(organizationId: string, userId: string, id: string, archived: boolean) {
  return withTenant(organizationId, async (tx) => {
    await readProduct(tx, organizationId, id);
    await tx
      .update(products)
      .set({ archivedAt: archived ? new Date() : null, updatedBy: userId })
      .where(and(eq(products.organizationId, organizationId), eq(products.id, id)));
    return readProduct(tx, organizationId, id);
  });
}

/* ---------------- Services ---------------- */

const SERVICE_UNIQUE = { services_code_uq: ["code", "Another service already uses this code."] } as const;

const serviceFields = {
  id: services.id,
  name: services.name,
  code: services.code,
  description: services.description,
  categoryId: services.categoryId,
  categoryName: productCategories.name,
  unitId: services.unitId,
  unitCode: units.code,
  sacCode: services.sacCode,
  taxCategory: services.taxCategory,
  taxRate: services.taxRate,
  ratePaise: services.ratePaise,
  archivedAt: services.archivedAt,
  updatedAt: services.updatedAt,
};

function serviceQuery(tx: TenantTx) {
  return tx
    .select(serviceFields)
    .from(services)
    .leftJoin(units, and(eq(units.organizationId, services.organizationId), eq(units.id, services.unitId)))
    .leftJoin(
      productCategories,
      and(eq(productCategories.organizationId, services.organizationId), eq(productCategories.id, services.categoryId)),
    );
}

export async function listServices(organizationId: string, q: ListQuery & { categoryId?: string | null }) {
  return withTenant(organizationId, async (tx) => {
    const filter = where(
      eq(services.organizationId, organizationId),
      statusFilter(services.archivedAt, q.status),
      q.categoryId ? eq(services.categoryId, q.categoryId) : undefined,
      searchFilter(q.q, [services.name, services.code, services.sacCode]),
    );
    const [{ total }] = await tx.select({ total: count() }).from(services).where(filter);
    const rows = await serviceQuery(tx)
      .where(filter)
      .orderBy(byName(services.name), asc(services.id))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    return paged(rows, total, q);
  });
}

async function readService(tx: TenantTx, organizationId: string, id: string) {
  const [s] = await serviceQuery(tx).where(and(eq(services.organizationId, organizationId), eq(services.id, id)));
  if (!s) notFound("service");
  return s;
}

export async function getService(organizationId: string, id: string) {
  return withTenant(organizationId, (tx) => readService(tx, organizationId, id));
}

async function checkServiceCode(tx: TenantTx, organizationId: string, code: string | null, selfId?: string) {
  if (!code) return;
  const [hit] = await tx
    .select({ name: services.name })
    .from(services)
    .where(and(eq(services.organizationId, organizationId), eq(services.code, code), selfId ? ne(services.id, selfId) : undefined))
    .limit(1);
  if (hit) conflict("DUPLICATE", `${hit.name} already uses this code.`, { code: `${hit.name} already uses this code.` });
}

export async function createService(organizationId: string, userId: string, v: ServiceValues) {
  return guardUnique(
    () =>
      withTenant(organizationId, async (tx) => {
        await checkUnit(tx, organizationId, v.unitId);
        await checkCategory(tx, organizationId, v.categoryId);
        await checkServiceCode(tx, organizationId, v.code);
        const [row] = await tx
          .insert(services)
          .values({ organizationId, ...v, createdBy: userId, updatedBy: userId })
          .returning({ id: services.id });
        return readService(tx, organizationId, row.id);
      }),
    SERVICE_UNIQUE,
  );
}

export async function updateService(organizationId: string, userId: string, id: string, v: ServiceValues) {
  return guardUnique(
    () =>
      withTenant(organizationId, async (tx) => {
        const current = await readService(tx, organizationId, id);
        await checkUnit(tx, organizationId, v.unitId, current.unitId);
        await checkCategory(tx, organizationId, v.categoryId, current.categoryId);
        await checkServiceCode(tx, organizationId, v.code, id);
        await tx
          .update(services)
          .set({ ...v, updatedBy: userId })
          .where(and(eq(services.organizationId, organizationId), eq(services.id, id)));
        return readService(tx, organizationId, id);
      }),
    SERVICE_UNIQUE,
  );
}

export async function setServiceArchived(organizationId: string, userId: string, id: string, archived: boolean) {
  return withTenant(organizationId, async (tx) => {
    await readService(tx, organizationId, id);
    await tx
      .update(services)
      .set({ archivedAt: archived ? new Date() : null, updatedBy: userId })
      .where(and(eq(services.organizationId, organizationId), eq(services.id, id)));
    return readService(tx, organizationId, id);
  });
}
