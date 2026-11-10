import { sql } from "drizzle-orm";

import { db } from "@/db";

export type TenantTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Runs `fn` in a transaction scoped to one tenant, with row-level security on.
 *
 * The connection switches to the limited `billing_tenant` role and sets
 * `app.organization_id` for this transaction only (both reset at commit or
 * rollback, so pooled connections are never left scoped). The policies in
 * drizzle/*_business_billing_rls then hide and refuse every other tenant's
 * rows, even if a query forgets its filter.
 *
 * All Business Billing data access goes through here. `organizationId` must
 * come from the signed-in session (requireBillingPermission), never from the
 * request.
 */
export async function withTenant<T>(organizationId: string, fn: (tx: TenantTx) => Promise<T>): Promise<T> {
  if (!organizationId) throw new Error("withTenant needs an organization id.");
  return db.transaction(async (tx) => {
    await tx.execute(sql`set local role billing_tenant`);
    await tx.execute(sql`select set_config('app.organization_id', ${organizationId}, true)`);
    return fn(tx);
  });
}
