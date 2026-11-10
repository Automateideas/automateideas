-- Row-level security for Business Billing (Stage 04).
--
-- The app connects as a superuser, which Postgres lets skip row-level
-- security. So Business Billing code runs inside withTenant()
-- (src/lib/business-billing/tenant-db.ts), which per transaction does:
--   SET LOCAL ROLE billing_tenant;
--   SELECT set_config('app.organization_id', <tenant>, true);
-- billing_tenant can't log in or bypass security, so these policies apply.
-- With no tenant set, current_setting() is null or empty and nothing matches.
-- Production should also log in as a non-superuser (see the Stage 04 notes).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'billing_tenant') THEN
    CREATE ROLE billing_tenant NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END
$$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO billing_tenant;
--> statement-breakpoint
-- Read-only access to the organization name (unconfigured billing settings show it).
GRANT SELECT (id, name) ON TABLE organization TO billing_tenant;
--> statement-breakpoint
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'billing_settings',
    'company_branches',
    'invoice_sequences',
    'accounts',
    'units',
    'product_categories',
    'products',
    'services',
    'price_lists',
    'price_list_items',
    'customers',
    'customer_addresses',
    'suppliers',
    'quotations',
    'sales_orders',
    'business_invoices',
    'credit_notes',
    'debit_notes',
    'quotation_items',
    'sales_order_items',
    'business_invoice_items',
    'credit_note_items',
    'debit_note_items',
    'purchase_orders',
    'purchase_bills',
    'purchase_order_items',
    'purchase_bill_items',
    'business_payments',
    'payment_allocations',
    'refunds',
    'journal_entries',
    'journal_lines',
    'audit_logs',
    'billing_files'
  ]
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE %I TO billing_tenant', t);
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I AS PERMISSIVE FOR ALL TO PUBLIC
         USING (organization_id = current_setting(''app.organization_id'', true))
         WITH CHECK (organization_id = current_setting(''app.organization_id'', true))',
      t
    );
  END LOOP;
END
$$;
--> statement-breakpoint
-- Audit logs are append-only for the app.
REVOKE UPDATE, DELETE ON TABLE audit_logs FROM billing_tenant;
