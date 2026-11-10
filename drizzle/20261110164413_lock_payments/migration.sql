-- Payments and refunds are financial records (Stage 08).
--
-- business_payments and refunds: once recorded, only status, voided_at,
-- void_reason, updated_at and updated_by may change (i.e. voiding). They are
-- never deleted, and a void stays void.
-- payment_allocations: rows can be added (applying an advance to an invoice)
-- while the payment is recorded, but never changed or deleted.
--
-- The app enforces the same (lib/business-billing/payments); these triggers
-- make sure a bug or a direct query can't break it.

CREATE OR REPLACE FUNCTION billing_lock_money_record() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  mutable text[] := ARRAY['status', 'voided_at', 'void_reason', 'updated_at', 'updated_by'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION '%.% is a financial record and cannot be deleted; void it instead', TG_TABLE_NAME, OLD.id
      USING ERRCODE = 'P0001', HINT = 'DOCUMENT_LOCKED';
  END IF;
  IF (to_jsonb(NEW) - mutable) IS DISTINCT FROM (to_jsonb(OLD) - mutable) THEN
    RAISE EXCEPTION '%.% is locked; only voiding is allowed', TG_TABLE_NAME, OLD.id
      USING ERRCODE = 'P0001', HINT = 'DOCUMENT_LOCKED';
  END IF;
  IF OLD.status = 'void' AND NEW.status <> 'void' THEN
    RAISE EXCEPTION '%.% is void and cannot be reopened', TG_TABLE_NAME, OLD.id
      USING ERRCODE = 'P0001', HINT = 'DOCUMENT_LOCKED';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION billing_lock_allocations() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  st text;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Payment allocations cannot be changed or deleted; void the payment instead'
      USING ERRCODE = 'P0001', HINT = 'DOCUMENT_LOCKED';
  END IF;
  SELECT status INTO st FROM business_payments WHERE id = NEW.payment_id;
  IF st IS DISTINCT FROM 'recorded' THEN
    RAISE EXCEPTION 'Payment % is not recorded; it cannot be allocated', NEW.payment_id
      USING ERRCODE = 'P0001', HINT = 'DOCUMENT_LOCKED';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS lock_recorded ON business_payments;
--> statement-breakpoint
CREATE TRIGGER lock_recorded BEFORE UPDATE OR DELETE ON business_payments FOR EACH ROW EXECUTE FUNCTION billing_lock_money_record();
--> statement-breakpoint
DROP TRIGGER IF EXISTS lock_recorded ON refunds;
--> statement-breakpoint
CREATE TRIGGER lock_recorded BEFORE UPDATE OR DELETE ON refunds FOR EACH ROW EXECUTE FUNCTION billing_lock_money_record();
--> statement-breakpoint
DROP TRIGGER IF EXISTS lock_allocations ON payment_allocations;
--> statement-breakpoint
CREATE TRIGGER lock_allocations BEFORE INSERT OR UPDATE OR DELETE ON payment_allocations FOR EACH ROW EXECUTE FUNCTION billing_lock_allocations();
