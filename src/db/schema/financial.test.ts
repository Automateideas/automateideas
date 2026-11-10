import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { organization } from "./auth";
import * as businessBilling from "./business-billing";
import { subscriptionPayment } from "./subscription";

// Tables whose rows are configuration, not financial records, and may be
// removed together with their organization.
const CONFIG_TABLES = new Set(["billing_settings"]);

function organizationForeignKeys(table: PgTable) {
  const config = getTableConfig(table);
  return config.foreignKeys
    .filter((fk) => fk.reference().foreignTable === organization)
    .map((fk) => ({ table: config.name, onDelete: fk.onDelete }));
}

describe("financial records survive organization deletion", () => {
  it("subscription payments use ON DELETE RESTRICT", () => {
    expect(organizationForeignKeys(subscriptionPayment)).toEqual([
      { table: "subscription_payment", onDelete: "restrict" },
    ]);
  });

  it("detects a cascading table (sanity check for this test)", () => {
    expect(organizationForeignKeys(businessBilling.billingSettings)).toEqual([
      { table: "billing_settings", onDelete: "cascade" },
    ]);
  });

  it("every Business Billing table except configuration uses ON DELETE RESTRICT", () => {
    const tables = (Object.values(businessBilling) as unknown[]).filter((t): t is PgTable => t instanceof PgTable);
    expect(tables.length).toBeGreaterThan(0);
    for (const table of tables) {
      const name = getTableConfig(table).name;
      if (CONFIG_TABLES.has(name)) continue;
      for (const fk of organizationForeignKeys(table)) {
        expect(fk, `${name} must not cascade from organization`).toEqual({ table: name, onDelete: "restrict" });
      }
    }
  });
});
