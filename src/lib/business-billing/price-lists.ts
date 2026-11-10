import { and, asc, count, eq, isNull, ne, sql } from "drizzle-orm";

import { customers, priceListItems, priceLists, products, services } from "@/db/schema";

import type { PriceListItemValues, PriceListValues } from "./catalogue-validation";
import { type ListQuery, guardUnique, invalid, notFound, statusFilter, where } from "./records";
import { type TenantTx, withTenant } from "./tenant-db";

// Price lists: special prices for some products and services (e.g.
// Wholesale), assigned to customers. Items not in a list use the normal price.

const UNIQUE = {
  price_lists_name_uq: ["name", "Another price list already has this name."],
  price_lists_one_default_uq: ["isDefault", "Another price list was just made the default. Try again."],
  price_list_items_product_uq: ["item", "This product is already in the list."],
  price_list_items_service_uq: ["item", "This service is already in the list."],
} as const;

export async function listPriceLists(organizationId: string, status: ListQuery["status"] = "active") {
  return withTenant(organizationId, async (tx) => {
    const itemCount = sql<number>`(select count(*) from price_list_items i where i.organization_id = "price_lists"."organization_id" and i.price_list_id = "price_lists"."id")::int`;
    const customerCount = sql<number>`(select count(*) from customers c where c.organization_id = "price_lists"."organization_id" and c.price_list_id = "price_lists"."id" and c.archived_at is null)::int`;
    return tx
      .select({
        id: priceLists.id,
        name: priceLists.name,
        currency: priceLists.currency,
        isDefault: priceLists.isDefault,
        archivedAt: priceLists.archivedAt,
        itemCount,
        customerCount,
      })
      .from(priceLists)
      .where(where(eq(priceLists.organizationId, organizationId), statusFilter(priceLists.archivedAt, status)))
      .orderBy(asc(sql`lower(${priceLists.name})`));
  });
}

async function readPriceList(tx: TenantTx, organizationId: string, id: string) {
  const [pl] = await tx
    .select()
    .from(priceLists)
    .where(and(eq(priceLists.organizationId, organizationId), eq(priceLists.id, id)));
  if (!pl) notFound("price list");

  const items = await tx
    .select({
      id: priceListItems.id,
      productId: priceListItems.productId,
      serviceId: priceListItems.serviceId,
      pricePaise: priceListItems.pricePaise,
      name: sql<string>`coalesce(${products.name}, ${services.name})`,
      code: sql<string | null>`coalesce(${products.sku}, ${services.code})`,
      // The item's normal price, to compare against.
      basePricePaise: sql<number>`coalesce(${products.salePricePaise}, ${services.ratePaise})`.mapWith(Number),
      archived: sql<boolean>`coalesce(${products.archivedAt}, ${services.archivedAt}) is not null`,
    })
    .from(priceListItems)
    .leftJoin(products, and(eq(products.organizationId, priceListItems.organizationId), eq(products.id, priceListItems.productId)))
    .leftJoin(services, and(eq(services.organizationId, priceListItems.organizationId), eq(services.id, priceListItems.serviceId)))
    .where(and(eq(priceListItems.organizationId, organizationId), eq(priceListItems.priceListId, id)))
    .orderBy(asc(sql`lower(coalesce(${products.name}, ${services.name}))`));

  const [{ customerCount }] = await tx
    .select({ customerCount: count() })
    .from(customers)
    .where(and(eq(customers.organizationId, organizationId), eq(customers.priceListId, id), isNull(customers.archivedAt)));

  return {
    id: pl.id,
    name: pl.name,
    currency: pl.currency,
    isDefault: pl.isDefault,
    archivedAt: pl.archivedAt,
    updatedAt: pl.updatedAt,
    customerCount,
    items,
  };
}

export type PriceListDetail = Awaited<ReturnType<typeof readPriceList>>;

export async function getPriceList(organizationId: string, id: string) {
  return withTenant(organizationId, (tx) => readPriceList(tx, organizationId, id));
}

/** Only one default per tenant: clear the others first (same transaction). */
async function clearDefault(tx: TenantTx, organizationId: string, exceptId?: string) {
  await tx
    .update(priceLists)
    .set({ isDefault: false })
    .where(and(eq(priceLists.organizationId, organizationId), eq(priceLists.isDefault, true), exceptId ? ne(priceLists.id, exceptId) : undefined));
}

export async function createPriceList(organizationId: string, userId: string, v: PriceListValues) {
  return guardUnique(
    () =>
      withTenant(organizationId, async (tx) => {
        if (v.isDefault) await clearDefault(tx, organizationId);
        const [row] = await tx
          .insert(priceLists)
          .values({ organizationId, ...v, createdBy: userId, updatedBy: userId })
          .returning({ id: priceLists.id });
        return readPriceList(tx, organizationId, row.id);
      }),
    UNIQUE,
  );
}

export async function updatePriceList(organizationId: string, userId: string, id: string, v: PriceListValues) {
  return guardUnique(
    () =>
      withTenant(organizationId, async (tx) => {
        const current = await readPriceList(tx, organizationId, id);
        if (v.isDefault && current.archivedAt) invalid({ isDefault: "Restore this price list before making it the default." });
        if (v.isDefault) await clearDefault(tx, organizationId, id);
        await tx
          .update(priceLists)
          .set({ ...v, updatedBy: userId })
          .where(and(eq(priceLists.organizationId, organizationId), eq(priceLists.id, id)));
        return readPriceList(tx, organizationId, id);
      }),
    UNIQUE,
  );
}

/** Archiving also drops the default flag. Customers keep the list until changed. */
export async function setPriceListArchived(organizationId: string, userId: string, id: string, archived: boolean) {
  return withTenant(organizationId, async (tx) => {
    await readPriceList(tx, organizationId, id);
    await tx
      .update(priceLists)
      .set({ archivedAt: archived ? new Date() : null, ...(archived ? { isDefault: false } : {}), updatedBy: userId })
      .where(and(eq(priceLists.organizationId, organizationId), eq(priceLists.id, id)));
    return readPriceList(tx, organizationId, id);
  });
}

/** Adds an item to the list, or changes its price if it's already there. */
export async function upsertPriceListItem(organizationId: string, userId: string, priceListId: string, v: PriceListItemValues) {
  return guardUnique(
    () =>
      withTenant(organizationId, async (tx) => {
        const current = await readPriceList(tx, organizationId, priceListId);
        if (current.archivedAt) invalid({ item: "Restore this price list before changing it." });

        const table = v.productId ? products : services;
        const itemId = (v.productId ?? v.serviceId)!;
        const [item] = await tx
          .select({ id: table.id })
          .from(table)
          .where(and(eq(table.organizationId, organizationId), eq(table.id, itemId), isNull(table.archivedAt)));
        if (!item) invalid({ item: `Choose an active ${v.productId ? "product" : "service"}.` });

        const existing = current.items.find((i) => (v.productId ? i.productId === v.productId : i.serviceId === v.serviceId));
        if (existing) {
          await tx
            .update(priceListItems)
            .set({ pricePaise: v.pricePaise, updatedBy: userId })
            .where(and(eq(priceListItems.organizationId, organizationId), eq(priceListItems.id, existing.id)));
        } else {
          await tx.insert(priceListItems).values({
            organizationId,
            priceListId,
            productId: v.productId,
            serviceId: v.serviceId,
            pricePaise: v.pricePaise,
            createdBy: userId,
            updatedBy: userId,
          });
        }
        return readPriceList(tx, organizationId, priceListId);
      }),
    UNIQUE,
  );
}

/** Removes an item from the list (it goes back to its normal price). */
export async function removePriceListItem(organizationId: string, priceListId: string, itemId: string) {
  return withTenant(organizationId, async (tx) => {
    const current = await readPriceList(tx, organizationId, priceListId);
    if (current.archivedAt) invalid({ item: "Restore this price list before changing it." });
    const deleted = await tx
      .delete(priceListItems)
      .where(
        and(
          eq(priceListItems.organizationId, organizationId),
          eq(priceListItems.priceListId, priceListId),
          eq(priceListItems.id, itemId),
        ),
      )
      .returning({ id: priceListItems.id });
    if (!deleted.length) notFound("price list item");
    return readPriceList(tx, organizationId, priceListId);
  });
}
