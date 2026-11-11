import { inArray, sql } from "drizzle-orm";

import { db } from "@/db";
import { organization } from "@/db/schema";

/**
 * Removes test organizations and every row they own, in all tenant tables.
 * Financial records and journals are locked by database triggers, so this
 * runs with triggers off (session_replication_role = replica) for the test's
 * own rows only. Tests only.
 */
export async function removeTestTenants(orgIds: string[]) {
  if (!orgIds.length) return;
  await db.transaction(async (tx) => {
    await tx.execute(sql`set local session_replication_role = replica`);
    const { rows } = await tx.execute<{ t: string }>(sql`
      select table_name as t from information_schema.columns
      where table_schema = 'public' and column_name = 'organization_id'
        and table_name not in ('member', 'invitation', 'subscription_payment')`);
    for (const { t } of rows) {
      await tx.execute(sql`delete from ${sql.identifier(t)} where organization_id in (${sql.join(orgIds.map((id) => sql`${id}`), sql`, `)})`);
    }
  });
  await db.delete(organization).where(inArray(organization.id, orgIds));
}
