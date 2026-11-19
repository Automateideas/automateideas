-- Recurring invoices (Stage 14c): row-level security for the new tables.
-- The schedule and its run log are ordinary tenant data; the invoices they
-- create are locked on issue like any other (*_lock_issued_documents).

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['recurring_invoices', 'recurring_invoice_runs']
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
