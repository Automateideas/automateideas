import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { organization, user } from "./auth";
import * as bb from "./business-billing";
import * as subscription from "./subscription";

const tables = (Object.values(bb) as unknown[]).filter((t): t is PgTable => t instanceof PgTable);
const configs = tables.map((t) => getTableConfig(t));

describe("business billing schema", () => {
  it("lists every table in BUSINESS_BILLING_TABLES, and only those", () => {
    expect(configs.map((c) => c.name).sort()).toEqual([...bb.BUSINESS_BILLING_TABLES].sort());
  });

  it("has the requested tables (purchase_items split in two) plus the approved additions", () => {
    const requested = [
      "billing_settings", "invoice_sequences", "company_branches",
      "customers", "suppliers", "customer_addresses",
      "products", "services", "product_categories", "units", "price_lists",
      "business_invoices", "business_invoice_items", "quotations", "sales_orders", "credit_notes", "debit_notes",
      "business_payments", "payment_allocations", "refunds",
      "purchase_orders", "purchase_bills",
      "accounts", "journal_entries", "journal_lines",
      "audit_logs", "billing_files",
    ];
    // purchase_items was approved as two tables: purchase_order_items + purchase_bill_items.
    const added = [
      "price_list_items", "quotation_items", "sales_order_items", "credit_note_items", "debit_note_items",
      "purchase_order_items", "purchase_bill_items",
      // Stage 10: purchase returns (debit notes to suppliers).
      "purchase_returns", "purchase_return_items",
      // Stage 14a: inventory (warehouses, stock_movements and stock_adjustments were in the requested list).
      "warehouses", "stock_movements", "stock_adjustments", "stock_adjustment_items",
      // Stage 14b: share links and the sent-messages log.
      "document_shares", "billing_messages",
      // Stage 14c: recurring invoices.
      "recurring_invoices", "recurring_invoice_runs",
      // Stage 14d: a company's own WhatsApp number.
      "whatsapp_connections",
    ];
    expect([...requested, ...added].sort()).toEqual([...bb.BUSINESS_BILLING_TABLES].sort());
  });

  it.each(configs.map((c) => [c.name, c] as const))("%s has a required organization_id", (_name, config) => {
    const col = config.columns.find((c) => c.name === "organization_id");
    expect(col?.notNull).toBe(true);
  });

  it("links tables only through (organization_id, id) pairs, so rows can't cross tenants", () => {
    for (const config of configs) {
      for (const fk of config.foreignKeys) {
        const ref = fk.reference();
        if (ref.foreignTable === organization || ref.foreignTable === user) continue;
        const name = `${config.name} → ${getTableConfig(ref.foreignTable).name}`;
        expect(ref.columns[0]?.name, name).toBe("organization_id");
        expect(ref.foreignColumns[0]?.name, name).toBe("organization_id");
        expect(ref.foreignColumns[1]?.name, name).toBe("id");
      }
    }
  });

  it("keeps subscription tables out of Business Billing", () => {
    const subscriptionTables = (Object.values(subscription) as unknown[])
      .filter((t): t is PgTable => t instanceof PgTable)
      .map((t) => getTableConfig(t).name);
    for (const name of subscriptionTables) expect(bb.BUSINESS_BILLING_TABLES).not.toContain(name);
    for (const config of configs) {
      for (const fk of config.foreignKeys) {
        expect(subscriptionTables).not.toContain(getTableConfig(fk.reference().foreignTable).name);
      }
    }
  });

  it("puts every table under row-level security in an RLS migration", () => {
    const dir = path.resolve(__dirname, "../../../drizzle");
    const folder = readdirSync(dir).find((d) => d.endsWith("_business_billing_rls"));
    expect(folder).toBeDefined();
    const migration = readFileSync(path.join(dir, folder!, "migration.sql"), "utf8");
    // Tables added later get RLS in their own migration (e.g. *_purchases_rls_and_locks).
    const later = readdirSync(dir)
      .filter((d) => d.endsWith("_rls_and_locks"))
      .map((d) => readFileSync(path.join(dir, d, "migration.sql"), "utf8"))
      .join("\n");
    for (const name of bb.BUSINESS_BILLING_TABLES) expect(migration + later, name).toContain(`'${name}'`);
    expect(later).toContain("FORCE ROW LEVEL SECURITY");
    expect(migration).toContain("FORCE ROW LEVEL SECURITY");
    expect(migration).toContain("REVOKE UPDATE, DELETE ON TABLE audit_logs");
  });
});
