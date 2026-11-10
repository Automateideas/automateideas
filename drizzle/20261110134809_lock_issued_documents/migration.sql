-- Issued sales documents are locked (Stage 07).
--
-- Once a quotation, sales order, invoice, credit note or debit note leaves
-- "draft", its contents can't change and it can't be deleted. Only these
-- columns may still change: status, voided_at, void_reason, updated_at,
-- updated_by (status moves like issued → partially_paid → paid, or → void).
-- A voided document stays void, and nothing goes back to draft.
-- Line items of a non-draft document can't be added, changed or removed.
--
-- The app enforces the same rules (lib/business-billing/documents.ts); these
-- triggers make sure a bug or a direct query can't break them either.

CREATE OR REPLACE FUNCTION billing_lock_issued_document() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  mutable text[] := ARRAY['status', 'voided_at', 'void_reason', 'updated_at', 'updated_by'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'Issued document %.% cannot be deleted; void it instead', TG_TABLE_NAME, OLD.id
        USING ERRCODE = 'P0001', HINT = 'DOCUMENT_LOCKED';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status <> 'draft' THEN
    IF (to_jsonb(NEW) - mutable) IS DISTINCT FROM (to_jsonb(OLD) - mutable) THEN
      RAISE EXCEPTION 'Issued document %.% is locked', TG_TABLE_NAME, OLD.id
        USING ERRCODE = 'P0001', HINT = 'DOCUMENT_LOCKED';
    END IF;
    IF NEW.status = 'draft' THEN
      RAISE EXCEPTION 'Document %.% cannot go back to draft', TG_TABLE_NAME, OLD.id
        USING ERRCODE = 'P0001', HINT = 'DOCUMENT_LOCKED';
    END IF;
    IF OLD.status = 'void' AND NEW.status <> 'void' THEN
      RAISE EXCEPTION 'Voided document %.% cannot be reopened', TG_TABLE_NAME, OLD.id
        USING ERRCODE = 'P0001', HINT = 'DOCUMENT_LOCKED';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
-- TG_ARGV[0]: parent table, TG_ARGV[1]: the item's parent id column.
CREATE OR REPLACE FUNCTION billing_lock_issued_items() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  parent_table text := TG_ARGV[0];
  parent_col text := TG_ARGV[1];
  ids text[];
  pid text;
  st text;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN ids := array_append(ids, to_jsonb(OLD) ->> parent_col); END IF;
  IF TG_OP IN ('UPDATE', 'INSERT') THEN ids := array_append(ids, to_jsonb(NEW) ->> parent_col); END IF;
  FOREACH pid IN ARRAY ids LOOP
    EXECUTE format('SELECT status FROM %I WHERE id = $1', parent_table) INTO st USING pid;
    -- st is null when the parent draft itself is being deleted (cascade).
    IF st IS NOT NULL AND st <> 'draft' THEN
      RAISE EXCEPTION 'Items of issued document %.% are locked', parent_table, pid
        USING ERRCODE = 'P0001', HINT = 'DOCUMENT_LOCKED';
    END IF;
  END LOOP;
  RETURN COALESCE(NEW, OLD);
END
$$;
--> statement-breakpoint
DO $$
DECLARE
  d record;
BEGIN
  FOR d IN SELECT * FROM (VALUES
    ('quotations', 'quotation_items', 'quotation_id'),
    ('sales_orders', 'sales_order_items', 'sales_order_id'),
    ('business_invoices', 'business_invoice_items', 'invoice_id'),
    ('credit_notes', 'credit_note_items', 'credit_note_id'),
    ('debit_notes', 'debit_note_items', 'debit_note_id')
  ) AS t(doc, items, col)
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS lock_issued ON %I', d.doc);
    EXECUTE format('CREATE TRIGGER lock_issued BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION billing_lock_issued_document()', d.doc);
    EXECUTE format('DROP TRIGGER IF EXISTS lock_issued_items ON %I', d.items);
    EXECUTE format('CREATE TRIGGER lock_issued_items BEFORE INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION billing_lock_issued_items(%L, %L)', d.items, d.doc, d.col);
  END LOOP;
END
$$;
