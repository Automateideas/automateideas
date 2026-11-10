import { randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/db";
import {
  auditLogs,
  BUSINESS_BILLING_TABLES,
  billingSettings,
  businessInvoices,
  businessPayments,
  customers,
  organization,
} from "@/db/schema";
import { getBillingSettings, saveBillingSettings } from "@/lib/business-billing/settings";
import { withTenant } from "@/lib/business-billing/tenant-db";

// Real database: Business Billing row-level security and tenant-safe keys.
// Two throwaway organizations, removed in afterAll.

const stamp = Date.now().toString(36);
const A = `rlstest-a-${stamp}`;
const B = `rlstest-b-${stamp}`;
let customerA = "";
let customerB = "";

/** The Postgres error behind a failed Drizzle query. */
async function pgError(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (e) {
    const err = e as { message?: string; cause?: { message?: string; code?: string } };
    return `${err.cause?.code ?? ""} ${err.cause?.message ?? err.message ?? String(e)}`;
  }
  return "no error";
}

beforeAll(async () => {
  await db.insert(organization).values([
    { id: A, name: "RLS Test A", slug: A, createdAt: new Date() },
    { id: B, name: "RLS Test B", slug: B, createdAt: new Date() },
  ]);
  // Inserts go through withTenant, so the policies' WITH CHECK allows them.
  [{ id: customerA }] = await withTenant(A, (tx) =>
    tx.insert(customers).values({ organizationId: A, name: "Alpha Customer" }).returning({ id: customers.id }),
  );
  [{ id: customerB }] = await withTenant(B, (tx) =>
    tx.insert(customers).values({ organizationId: B, name: "Bravo Customer" }).returning({ id: customers.id }),
  );
});

afterAll(async () => {
  // As the superuser owner (bypasses RLS), children first: org rows are RESTRICT.
  const orgs = [A, B];
  // Issued invoices are locked by triggers (Stage 07); this test's own rows are
  // removed with triggers off. These invoices have no lines.
  await db.transaction(async (tx) => {
    await tx.execute(sql`set local session_replication_role = replica`);
    await tx.delete(businessInvoices).where(inArray(businessInvoices.organizationId, orgs));
  });
  await db.delete(businessPayments).where(inArray(businessPayments.organizationId, orgs));
  await db.delete(customers).where(inArray(customers.organizationId, orgs));
  await db.delete(auditLogs).where(inArray(auditLogs.organizationId, orgs));
  await db.delete(billingSettings).where(inArray(billingSettings.organizationId, orgs));
  await db.delete(organization).where(inArray(organization.id, orgs));
});

describe("row-level security setup", () => {
  it("is enabled and forced on every Business Billing table, with the tenant policy", async () => {
    const rows = await db.execute<{ relname: string; rls: boolean; forced: boolean; policies: number }>(sql`
      select c.relname, c.relrowsecurity as rls, c.relforcerowsecurity as forced,
        (select count(*)::int from pg_policies p where p.tablename = c.relname and p.policyname = 'tenant_isolation') as policies
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = any(${sql.raw(`array[${BUSINESS_BILLING_TABLES.map((t) => `'${t}'`).join(",")}]`)})`);
    const found = new Map(rows.rows.map((r) => [r.relname, r]));
    for (const t of BUSINESS_BILLING_TABLES) {
      expect(found.get(t), t).toMatchObject({ rls: true, forced: true, policies: 1 });
    }
  });

  it("uses a role that can't log in or bypass security", async () => {
    const { rows } = await db.execute<{ rolsuper: boolean; rolbypassrls: boolean; rolcanlogin: boolean }>(
      sql`select rolsuper, rolbypassrls, rolcanlogin from pg_roles where rolname = 'billing_tenant'`,
    );
    expect(rows[0]).toEqual({ rolsuper: false, rolbypassrls: false, rolcanlogin: false });
  });

  it("generates text UUID ids", () => {
    expect(customerA).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("leaves subscription and auth tables without row-level security", async () => {
    const { rows } = await db.execute<{ relname: string; rls: boolean }>(sql`
      select relname, relrowsecurity as rls from pg_class
      where relname in ('organization', 'user', 'member', 'session', 'subscription_payment')`);
    expect(rows.every((r) => r.rls === false)).toBe(true);
  });
});

describe("tenant isolation", () => {
  it("shows a tenant only its own rows, even with no filter", async () => {
    const rows = await withTenant(A, (tx) => tx.select({ id: customers.id, org: customers.organizationId }).from(customers));
    expect(rows.map((r) => r.org)).toEqual([A]);
    expect(rows.map((r) => r.id)).toEqual([customerA]);
  });

  it("can't read another tenant's row by id", async () => {
    const rows = await withTenant(A, (tx) => tx.select().from(customers).where(eq(customers.id, customerB)));
    expect(rows).toHaveLength(0);
  });

  it("can't insert a row for another tenant", async () => {
    const err = await pgError(
      withTenant(A, (tx) => tx.insert(customers).values({ organizationId: B, name: "Sneaky" })),
    );
    expect(err).toMatch(/row-level security/);
  });

  it("can't update or delete another tenant's rows", async () => {
    const updated = await withTenant(A, (tx) =>
      tx.update(customers).set({ name: "Hacked" }).where(eq(customers.id, customerB)).returning({ id: customers.id }),
    );
    const deleted = await withTenant(A, (tx) =>
      tx.delete(customers).where(eq(customers.id, customerB)).returning({ id: customers.id }),
    );
    expect(updated).toHaveLength(0);
    expect(deleted).toHaveLength(0);
    const [still] = await db.select({ name: customers.name }).from(customers).where(eq(customers.id, customerB));
    expect(still.name).toBe("Bravo Customer");
  });

  it("can't move its own row to another tenant", async () => {
    const err = await pgError(
      withTenant(A, (tx) => tx.update(customers).set({ organizationId: B }).where(eq(customers.id, customerA))),
    );
    expect(err).toMatch(/row-level security|violates foreign key/);
  });

  it("sees nothing when no tenant is set", async () => {
    const rows = await db.transaction(async (tx) => {
      await tx.execute(sql`set local role billing_tenant`);
      return tx.select().from(customers);
    });
    expect(rows).toHaveLength(0);
  });

  it("can't reach subscription or user data from the tenant role", async () => {
    const err = await pgError(
      withTenant(A, (tx) => tx.execute(sql`select count(*) from subscription_payment`)),
    );
    expect(err).toMatch(/permission denied/);
    const userErr = await pgError(withTenant(A, (tx) => tx.execute(sql`select email from "user"`)));
    expect(userErr).toMatch(/permission denied/);
  });
});

describe("database keys", () => {
  it("rejects an invoice pointing at another tenant's customer", async () => {
    // Even as the owner (no RLS), the composite key refuses the cross-tenant link.
    const err = await pgError(
      db.insert(businessInvoices).values({
        organizationId: A,
        customerId: customerB,
        issueDate: "2026-11-10",
        status: "draft",
      }),
    );
    expect(err).toMatch(/business_invoices_party_fk/);
  });

  it("keeps document numbers unique per tenant, not across tenants", async () => {
    await withTenant(A, (tx) =>
      tx.insert(businessInvoices).values({ organizationId: A, customerId: customerA, number: "INV-0001", issueDate: "2026-11-10", status: "issued" }),
    );
    const dup = await pgError(
      withTenant(A, (tx) =>
        tx.insert(businessInvoices).values({ organizationId: A, customerId: customerA, number: "INV-0001", issueDate: "2026-11-10", status: "issued" }),
      ),
    );
    expect(dup).toMatch(/business_invoices_number_uq/);
    await withTenant(B, (tx) =>
      tx.insert(businessInvoices).values({ organizationId: B, customerId: customerB, number: "INV-0001", issueDate: "2026-11-10", status: "issued" }),
    );
  });

  it("rejects a payment received from a supplier (check constraint)", async () => {
    const err = await pgError(
      withTenant(A, (tx) =>
        tx.insert(businessPayments).values({
          organizationId: A,
          direction: "received",
          supplierId: randomUUID(),
          paymentDate: "2026-11-10",
          amountPaise: 100,
          method: "upi",
        }),
      ),
    );
    expect(err).toMatch(/business_payments_party_check/);
  });

  it("refuses to delete an organization that has billing records", async () => {
    const err = await pgError(db.delete(organization).where(eq(organization.id, A)));
    expect(err).toMatch(/violates foreign key constraint/);
  });
});

describe("audit logs", () => {
  it("can be added and read, never changed or deleted, by the app", async () => {
    await withTenant(A, (tx) =>
      tx.insert(auditLogs).values({ organizationId: A, action: "test", entityType: "customer", entityId: customerA }),
    );
    const rows = await withTenant(A, (tx) => tx.select().from(auditLogs));
    expect(rows).toHaveLength(1);
    expect(await pgError(withTenant(A, (tx) => tx.update(auditLogs).set({ action: "edited" })))).toMatch(/permission denied/);
    expect(await pgError(withTenant(A, (tx) => tx.delete(auditLogs)))).toMatch(/permission denied/);
  });
});

describe("billing settings service under row-level security", () => {
  it("reads defaults, saves, and keeps tenants apart", async () => {
    const before = await getBillingSettings(A);
    expect(before).toMatchObject({ configured: false, legalName: "RLS Test A" });

    const saved = await saveBillingSettings(A, null as unknown as string, {
      legalName: "Alpha Pvt Ltd",
      tradeName: null,
      gstin: null,
      pan: null,
      email: null,
      phone: null,
      addressLine1: null,
      addressLine2: null,
      city: null,
      state: null,
      postalCode: null,
      countryCode: "IN",
      currency: "INR",
      financialYearStartMonth: 4,
      invoicePrefix: "A-",
    });
    expect(saved).toMatchObject({ configured: true, legalName: "Alpha Pvt Ltd" });
    expect(await getBillingSettings(B)).toMatchObject({ configured: false, legalName: "RLS Test B" });

    const rows = await db
      .select({ org: billingSettings.organizationId })
      .from(billingSettings)
      .where(and(inArray(billingSettings.organizationId, [A, B])));
    expect(rows).toEqual([{ org: A }]);
  });
});
