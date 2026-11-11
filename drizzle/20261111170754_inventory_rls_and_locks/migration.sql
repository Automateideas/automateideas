-- Inventory (Stage 14a): row-level security for the new tables, and the rules
-- that make stock records permanent.
--
-- - stock_movements: posted records, never changed or deleted. A void posts
--   the opposite movement (reverses_movement_id), like journal entries.
-- - stock_adjustments: only status/void fields may change (posted -> void),
--   never deleted. Same function as issued documents.
-- - stock_adjustment_items: added only in the transaction that creates the
--   adjustment, then never changed or deleted.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['warehouses', 'stock_movements', 'stock_adjustments', 'stock_adjustment_items']
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
DROP TRIGGER IF EXISTS stock_immutable ON stock_movements;
--> statement-breakpoint
CREATE TRIGGER stock_immutable BEFORE UPDATE OR DELETE ON stock_movements FOR EACH ROW EXECUTE FUNCTION billing_journal_immutable();
--> statement-breakpoint
DROP TRIGGER IF EXISTS lock_issued ON stock_adjustments;
--> statement-breakpoint
CREATE TRIGGER lock_issued BEFORE UPDATE OR DELETE ON stock_adjustments FOR EACH ROW EXECUTE FUNCTION billing_lock_issued_document();
--> statement-breakpoint
DROP TRIGGER IF EXISTS stock_immutable ON stock_adjustment_items;
--> statement-breakpoint
CREATE TRIGGER stock_immutable BEFORE UPDATE OR DELETE ON stock_adjustment_items FOR EACH ROW EXECUTE FUNCTION billing_journal_immutable();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION billing_adjustment_items_same_tx() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  created_xid text;
BEGIN
  SELECT xmin::text INTO created_xid FROM stock_adjustments WHERE id = NEW.adjustment_id;
  IF created_xid IS DISTINCT FROM (txid_current() % 4294967296)::text THEN
    RAISE EXCEPTION 'Lines can only be added to a stock adjustment in the transaction that creates it'
      USING ERRCODE = 'P0001', HINT = 'DOCUMENT_LOCKED';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS adjustment_items_same_tx ON stock_adjustment_items;
--> statement-breakpoint
CREATE TRIGGER adjustment_items_same_tx BEFORE INSERT ON stock_adjustment_items FOR EACH ROW EXECUTE FUNCTION billing_adjustment_items_same_tx();
