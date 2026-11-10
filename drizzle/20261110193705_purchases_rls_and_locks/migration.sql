-- Purchases (Stage 10): row-level security for the new tables, and locking
-- of issued purchase documents (same rules as sales, see *_lock_issued_documents).

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['purchase_returns', 'purchase_return_items']
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
DO $$
DECLARE
  d record;
BEGIN
  FOR d IN SELECT * FROM (VALUES
    ('purchase_orders', 'purchase_order_items', 'purchase_order_id'),
    ('purchase_bills', 'purchase_bill_items', 'purchase_bill_id'),
    ('purchase_returns', 'purchase_return_items', 'purchase_return_id')
  ) AS t(doc, items, col)
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS lock_issued ON %I', d.doc);
    EXECUTE format('CREATE TRIGGER lock_issued BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION billing_lock_issued_document()', d.doc);
    EXECUTE format('DROP TRIGGER IF EXISTS lock_issued_items ON %I', d.items);
    EXECUTE format('CREATE TRIGGER lock_issued_items BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION billing_lock_issued_items(%L, %L)', d.items, d.doc, d.col);
  END LOOP;
END
$$;
