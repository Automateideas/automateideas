import { and, asc, count, eq, isNull, ne, sql } from "drizzle-orm";

import { suppliers } from "@/db/schema";

import { syncOpeningBalance } from "./accounting/posting";
import type { SupplierValues } from "./contacts-validation";
import { todayInIndia } from "./documents/types";
import { type ListQuery, conflict, guardUnique, notFound, paged, searchFilter, statusFilter, where } from "./records";
import { type TenantTx, withTenant } from "./tenant-db";

// Suppliers of a tenant company. Archived, never deleted.

const UNIQUE = {
  suppliers_code_uq: ["code", "Another supplier already uses this code."],
  suppliers_active_gstin_uq: ["gstin", "Another supplier already uses this GSTIN."],
} as const;

export async function listSuppliers(organizationId: string, q: ListQuery) {
  return withTenant(organizationId, async (tx) => {
    const filter = where(
      eq(suppliers.organizationId, organizationId),
      statusFilter(suppliers.archivedAt, q.status),
      searchFilter(q.q, [suppliers.name, suppliers.displayName, suppliers.code, suppliers.gstin, suppliers.email, suppliers.phone]),
    );
    const [{ total }] = await tx.select({ total: count() }).from(suppliers).where(filter);
    const rows = await tx
      .select({
        id: suppliers.id,
        name: suppliers.name,
        displayName: suppliers.displayName,
        code: suppliers.code,
        gstin: suppliers.gstin,
        email: suppliers.email,
        phone: suppliers.phone,
        city: suppliers.city,
        state: suppliers.state,
        openingBalancePaise: suppliers.openingBalancePaise,
        archivedAt: suppliers.archivedAt,
      })
      .from(suppliers)
      .where(filter)
      .orderBy(asc(sql`lower(${suppliers.name})`), asc(suppliers.id))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    return paged(rows, total, q);
  });
}

async function readSupplier(tx: TenantTx, organizationId: string, id: string) {
  const [s] = await tx
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.organizationId, organizationId), eq(suppliers.id, id)))
    .limit(1);
  if (!s) notFound("supplier");
  const rest: Partial<typeof s> = { ...s };
  delete rest.organizationId;
  delete rest.createdBy;
  delete rest.updatedBy;
  // Owed to the supplier = opening + recorded bills − issued returns − payments made.
  const { rows: owed } = await tx.execute<{ n: string | number }>(sql`
    select
      coalesce((select sum(b.total_paise) from purchase_bills b where b.organization_id = ${organizationId} and b.supplier_id = ${id} and b.status in ('recorded', 'partially_paid', 'paid')), 0)
      - coalesce((select sum(pr.total_paise) from purchase_returns pr where pr.organization_id = ${organizationId} and pr.supplier_id = ${id} and pr.status = 'issued'), 0)
      - coalesce((select sum(p.amount_paise) from business_payments p where p.organization_id = ${organizationId} and p.supplier_id = ${id} and p.direction = 'made' and p.status = 'recorded'), 0) as n`);
  return { ...(rest as Omit<typeof s, "organizationId" | "createdBy" | "updatedBy">), outstandingPaise: s.openingBalancePaise + Number(owed[0]?.n ?? 0) };
}

export type SupplierDetail = Awaited<ReturnType<typeof readSupplier>>;

export async function getSupplier(organizationId: string, id: string) {
  return withTenant(organizationId, (tx) => readSupplier(tx, organizationId, id));
}

async function checkDuplicates(tx: TenantTx, organizationId: string, v: SupplierValues, selfId?: string) {
  const notSelf = selfId ? ne(suppliers.id, selfId) : undefined;
  if (v.gstin) {
    const [hit] = await tx
      .select({ name: suppliers.name })
      .from(suppliers)
      .where(and(eq(suppliers.organizationId, organizationId), isNull(suppliers.archivedAt), eq(suppliers.gstin, v.gstin), notSelf))
      .limit(1);
    if (hit) conflict("DUPLICATE_GSTIN", `${hit.name} already uses this GSTIN.`, { gstin: `${hit.name} already uses this GSTIN.` });
  }
  if (v.code) {
    const [hit] = await tx
      .select({ name: suppliers.name })
      .from(suppliers)
      .where(and(eq(suppliers.organizationId, organizationId), eq(suppliers.code, v.code), notSelf))
      .limit(1);
    if (hit) conflict("DUPLICATE_CODE", `${hit.name} already uses this code.`, { code: `${hit.name} already uses this code.` });
  }
}

export async function createSupplier(organizationId: string, userId: string, v: SupplierValues) {
  return guardUnique(
    () =>
      withTenant(organizationId, async (tx) => {
        await checkDuplicates(tx, organizationId, v);
        const [row] = await tx
          .insert(suppliers)
          .values({ organizationId, ...v, createdBy: userId, updatedBy: userId })
          .returning({ id: suppliers.id });
        await syncOpeningBalance(tx, organizationId, { kind: "supplier", id: row.id, name: v.name, openingBalancePaise: v.openingBalancePaise }, todayInIndia(), userId);
        return readSupplier(tx, organizationId, row.id);
      }),
    UNIQUE,
  );
}

export async function updateSupplier(organizationId: string, userId: string, id: string, v: SupplierValues) {
  return guardUnique(
    () =>
      withTenant(organizationId, async (tx) => {
        const current = await readSupplier(tx, organizationId, id);
        if (!current.archivedAt) await checkDuplicates(tx, organizationId, v, id);
        await tx
          .update(suppliers)
          .set({ ...v, updatedBy: userId })
          .where(and(eq(suppliers.organizationId, organizationId), eq(suppliers.id, id)));
        await syncOpeningBalance(tx, organizationId, { kind: "supplier", id, name: v.name, openingBalancePaise: v.openingBalancePaise }, todayInIndia(), userId);
        return readSupplier(tx, organizationId, id);
      }),
    UNIQUE,
  );
}

export async function setSupplierArchived(organizationId: string, userId: string, id: string, archived: boolean) {
  return guardUnique(
    () =>
      withTenant(organizationId, async (tx) => {
        const current = await readSupplier(tx, organizationId, id);
        if (!!current.archivedAt === archived) return current;
        if (!archived && current.gstin) {
          const [hit] = await tx
            .select({ name: suppliers.name })
            .from(suppliers)
            .where(and(eq(suppliers.organizationId, organizationId), isNull(suppliers.archivedAt), eq(suppliers.gstin, current.gstin)))
            .limit(1);
          if (hit) conflict("DUPLICATE_GSTIN", `Can't restore: ${hit.name} now uses this GSTIN.`);
        }
        await tx
          .update(suppliers)
          .set({ archivedAt: archived ? new Date() : null, updatedBy: userId })
          .where(and(eq(suppliers.organizationId, organizationId), eq(suppliers.id, id)));
        return readSupplier(tx, organizationId, id);
      }),
    UNIQUE,
  );
}
