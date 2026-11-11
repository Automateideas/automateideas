import { and, asc, count, eq, isNull, ne, or, sql } from "drizzle-orm";

import { customerAddresses, customers, priceLists } from "@/db/schema";

import { syncOpeningBalance } from "./accounting/posting";
import type { CustomerValues } from "./contacts-validation";
import { todayInIndia } from "./documents/types";
import type { AddressValues } from "./fields";
import { type ListQuery, conflict, guardUnique, invalid, notFound, paged, searchFilter, statusFilter, where } from "./records";
import { type TenantTx, withTenant } from "./tenant-db";

// Customers of a tenant company. Archived, never deleted (invoices and
// payments point at them). Every query also filters by organization_id;
// row-level security (withTenant) is the second lock.

const UNIQUE = {
  customers_code_uq: ["code", "Another customer already uses this code."],
  customers_active_gstin_uq: ["gstin", "Another customer already uses this GSTIN."],
} as const;

const billingAddr = sql`(select row_to_json(a) from (
  select city, state from customer_addresses ca
  where ca.organization_id = "customers"."organization_id" and ca.customer_id = "customers"."id"
    and ca.type = 'billing' and ca.is_default
) a)`;

export async function listCustomers(organizationId: string, q: ListQuery) {
  return withTenant(organizationId, async (tx) => {
    const filter = where(
      eq(customers.organizationId, organizationId),
      statusFilter(customers.archivedAt, q.status),
      searchFilter(q.q, [customers.name, customers.displayName, customers.code, customers.gstin, customers.email, customers.phone]),
    );
    const [{ total }] = await tx.select({ total: count() }).from(customers).where(filter);
    const rows = await tx
      .select({
        id: customers.id,
        name: customers.name,
        displayName: customers.displayName,
        customerType: customers.customerType,
        code: customers.code,
        gstin: customers.gstin,
        email: customers.email,
        phone: customers.phone,
        category: customers.category,
        openingBalancePaise: customers.openingBalancePaise,
        archivedAt: customers.archivedAt,
        // The driver may hand json back as text; accept both.
        address: billingAddr.mapWith(
          (v) => (typeof v === "string" ? JSON.parse(v) : v) as { city: string | null; state: string | null } | null,
        ),
      })
      .from(customers)
      .where(filter)
      .orderBy(asc(sql`lower(${customers.name})`), asc(customers.id))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    return paged(rows, total, q);
  });
}

function toAddress(row: typeof customerAddresses.$inferSelect | undefined): AddressValues | null {
  if (!row) return null;
  return {
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    city: row.city,
    state: row.state,
    stateCode: row.stateCode,
    postalCode: row.postalCode,
    countryCode: row.countryCode,
  };
}

async function readCustomer(tx: TenantTx, organizationId: string, id: string) {
  const [row] = await tx
    .select({ customer: customers, priceListName: priceLists.name })
    .from(customers)
    .leftJoin(priceLists, and(eq(priceLists.organizationId, customers.organizationId), eq(priceLists.id, customers.priceListId)))
    .where(and(eq(customers.organizationId, organizationId), eq(customers.id, id)))
    .limit(1);
  if (!row) notFound("customer");

  const addresses = await tx
    .select()
    .from(customerAddresses)
    .where(and(eq(customerAddresses.organizationId, organizationId), eq(customerAddresses.customerId, id), eq(customerAddresses.isDefault, true)));

  const c = row.customer;
  // Owed = opening + invoices + debit notes − credit notes − payments + refunds (issued/recorded only).
  const { rows: owed } = await tx.execute<{ n: string | number }>(sql`
    select
      coalesce((select sum(i.total_paise) from business_invoices i where i.organization_id = ${organizationId} and i.customer_id = ${id} and i.status in ('issued', 'partially_paid', 'paid')), 0)
      + coalesce((select sum(d.total_paise) from debit_notes d where d.organization_id = ${organizationId} and d.customer_id = ${id} and d.status = 'issued'), 0)
      - coalesce((select sum(cn.total_paise) from credit_notes cn where cn.organization_id = ${organizationId} and cn.customer_id = ${id} and cn.status = 'issued'), 0)
      - coalesce((select sum(p.amount_paise) from business_payments p where p.organization_id = ${organizationId} and p.customer_id = ${id} and p.status = 'recorded'), 0)
      + coalesce((select sum(r.amount_paise) from refunds r where r.organization_id = ${organizationId} and r.customer_id = ${id} and r.status = 'recorded'), 0) as n`);
  const billingAddress = toAddress(addresses.find((a) => a.type === "billing"));
  const shippingAddress = toAddress(addresses.find((a) => a.type === "shipping"));
  return {
    id: c.id,
    customerType: c.customerType,
    name: c.name,
    displayName: c.displayName,
    contactPerson: c.contactPerson,
    code: c.code,
    category: c.category,
    gstin: c.gstin,
    pan: c.pan,
    email: c.email,
    phone: c.phone,
    placeOfSupply: c.placeOfSupply,
    paymentTermsDays: c.paymentTermsDays,
    creditLimitPaise: c.creditLimitPaise,
    openingBalancePaise: c.openingBalancePaise,
    priceListId: c.priceListId,
    priceListName: row.priceListName,
    notes: c.notes,
    sendReminders: c.sendReminders,
    billingAddress,
    shippingAddress,
    archivedAt: c.archivedAt,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    // Positive: they owe you. Negative: you hold their advance or credit.
    outstandingPaise: c.openingBalancePaise + Number(owed[0]?.n ?? 0),
  };
}

export type CustomerDetail = Awaited<ReturnType<typeof readCustomer>>;

export async function getCustomer(organizationId: string, id: string) {
  return withTenant(organizationId, (tx) => readCustomer(tx, organizationId, id));
}

/** Price list must exist in this tenant and be active (or unchanged on edit). */
async function checkPriceList(tx: TenantTx, organizationId: string, id: string | null, current?: string | null) {
  if (!id || id === current) return;
  const [pl] = await tx
    .select({ id: priceLists.id })
    .from(priceLists)
    .where(and(eq(priceLists.organizationId, organizationId), eq(priceLists.id, id), isNull(priceLists.archivedAt)));
  if (!pl) invalid({ priceListId: "Choose an active price list." });
}

export type DuplicateMatch = { id: string; name: string; reason: string };

/**
 * Hard stops (same GSTIN or code as an active customer) and likely
 * duplicates (same email, phone or name) that need `allowDuplicate`.
 */
async function checkDuplicates(tx: TenantTx, organizationId: string, v: CustomerValues, allowDuplicate: boolean, selfId?: string) {
  const others = and(eq(customers.organizationId, organizationId), isNull(customers.archivedAt), selfId ? ne(customers.id, selfId) : undefined);

  if (v.gstin) {
    const [hit] = await tx.select({ name: customers.name }).from(customers).where(and(others, eq(customers.gstin, v.gstin))).limit(1);
    if (hit) conflict("DUPLICATE_GSTIN", `${hit.name} already uses this GSTIN.`, { gstin: `${hit.name} already uses this GSTIN.` });
  }
  if (v.code) {
    const [hit] = await tx
      .select({ name: customers.name })
      .from(customers)
      .where(and(eq(customers.organizationId, organizationId), eq(customers.code, v.code), selfId ? ne(customers.id, selfId) : undefined))
      .limit(1);
    if (hit) conflict("DUPLICATE_CODE", `${hit.name} already uses this code.`, { code: `${hit.name} already uses this code.` });
  }
  if (allowDuplicate) return;

  const digits = v.phone?.replace(/\D/g, "").slice(-10);
  const conditions = [
    sql`lower(${customers.name}) = ${v.name.toLowerCase()}`,
    v.email ? sql`lower(${customers.email}) = ${v.email}` : undefined,
    digits && digits.length >= 6 ? sql`right(regexp_replace(${customers.phone}, '\\D', '', 'g'), 10) = ${digits}` : undefined,
  ].filter(Boolean);
  const rows = await tx
    .select({ id: customers.id, name: customers.name, email: customers.email, phone: customers.phone })
    .from(customers)
    .where(and(others, or(...conditions)))
    .limit(5);
  if (!rows.length) return;

  const matches: DuplicateMatch[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    reason:
      v.email && r.email?.toLowerCase() === v.email
        ? "same email"
        : digits && r.phone?.replace(/\D/g, "").endsWith(digits)
          ? "same phone"
          : "same name",
  }));
  conflict(
    "POSSIBLE_DUPLICATE",
    `This looks like an existing customer: ${matches[0].name} (${matches[0].reason}).`,
    undefined,
    { matches },
  );
}

async function writeAddresses(tx: TenantTx, organizationId: string, customerId: string, userId: string, v: CustomerValues) {
  // Documents copy addresses when issued, so replacing these rows is safe.
  await tx
    .delete(customerAddresses)
    .where(and(eq(customerAddresses.organizationId, organizationId), eq(customerAddresses.customerId, customerId)));
  const rows = [{ type: "billing" as const, a: v.billingAddress }, ...(v.shippingAddress ? [{ type: "shipping" as const, a: v.shippingAddress }] : [])];
  await tx.insert(customerAddresses).values(
    rows.map(({ type, a }) => ({ organizationId, customerId, type, isDefault: true, ...a, createdBy: userId, updatedBy: userId })),
  );
}

/** The customer row's columns (addresses live in customer_addresses). */
function columns(v: CustomerValues) {
  const rest: Partial<CustomerValues> = { ...v };
  delete rest.billingAddress;
  delete rest.shippingAddress;
  return rest as Omit<CustomerValues, "billingAddress" | "shippingAddress">;
}

export async function createCustomer(organizationId: string, userId: string, v: CustomerValues, allowDuplicate = false) {
  return guardUnique(
    () =>
      withTenant(organizationId, async (tx) => {
        await checkPriceList(tx, organizationId, v.priceListId);
        await checkDuplicates(tx, organizationId, v, allowDuplicate);
        const [row] = await tx
          .insert(customers)
          .values({ organizationId, ...columns(v), createdBy: userId, updatedBy: userId })
          .returning({ id: customers.id });
        await writeAddresses(tx, organizationId, row.id, userId, v);
        await syncOpeningBalance(tx, organizationId, { kind: "customer", id: row.id, name: v.name, openingBalancePaise: v.openingBalancePaise }, todayInIndia(), userId);
        return readCustomer(tx, organizationId, row.id);
      }),
    UNIQUE,
  );
}

export async function updateCustomer(organizationId: string, userId: string, id: string, v: CustomerValues, allowDuplicate = false) {
  return guardUnique(
    () =>
      withTenant(organizationId, async (tx) => {
        const current = await readCustomer(tx, organizationId, id);
        await checkPriceList(tx, organizationId, v.priceListId, current.priceListId);
        // The "looks like an existing customer" warning only fires when the name,
        // email or phone changes; otherwise every later edit would nag again.
        const identityChanged =
          v.name.toLowerCase() !== current.name.toLowerCase() || v.email !== current.email || v.phone !== current.phone;
        await checkDuplicates(tx, organizationId, v, allowDuplicate || !identityChanged || !!current.archivedAt, id);
        await tx
          .update(customers)
          .set({ ...columns(v), updatedBy: userId })
          .where(and(eq(customers.organizationId, organizationId), eq(customers.id, id)));
        await writeAddresses(tx, organizationId, id, userId, v);
        // An edited opening balance posts only the difference.
        await syncOpeningBalance(tx, organizationId, { kind: "customer", id, name: v.name, openingBalancePaise: v.openingBalancePaise }, todayInIndia(), userId);
        return readCustomer(tx, organizationId, id);
      }),
    UNIQUE,
  );
}

/** Archive (hide from pickers) or restore. Restoring checks the GSTIN is still free. */
export async function setCustomerArchived(organizationId: string, userId: string, id: string, archived: boolean) {
  return guardUnique(
    () =>
      withTenant(organizationId, async (tx) => {
        const current = await readCustomer(tx, organizationId, id);
        if (!!current.archivedAt === archived) return current;
        if (!archived && current.gstin) {
          const [hit] = await tx
            .select({ name: customers.name })
            .from(customers)
            .where(and(eq(customers.organizationId, organizationId), isNull(customers.archivedAt), eq(customers.gstin, current.gstin)))
            .limit(1);
          if (hit) conflict("DUPLICATE_GSTIN", `Can't restore: ${hit.name} now uses this GSTIN.`);
        }
        await tx
          .update(customers)
          .set({ archivedAt: archived ? new Date() : null, updatedBy: userId })
          .where(and(eq(customers.organizationId, organizationId), eq(customers.id, id)));
        return readCustomer(tx, organizationId, id);
      }),
    UNIQUE,
  );
}

/** Distinct categories in use, for the form's suggestions. */
export async function customerCategories(organizationId: string) {
  return withTenant(organizationId, async (tx) => {
    const rows = await tx
      .selectDistinct({ category: customers.category })
      .from(customers)
      .where(and(eq(customers.organizationId, organizationId), sql`${customers.category} is not null`))
      .orderBy(asc(customers.category))
      .limit(100);
    return rows.map((r) => r.category!);
  });
}
