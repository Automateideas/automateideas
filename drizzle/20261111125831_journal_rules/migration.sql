-- Double-entry rules for the journal (Stage 11), enforced by the database.
--
-- 1. Every journal entry balances: total debits = total credits, with at
--    least two lines. Checked at COMMIT (deferred), so the app can insert an
--    entry's lines one by one inside its transaction.
-- 2. Posted entries are immutable: journal entries and lines can't be
--    updated or deleted. Mistakes are corrected with a reversing entry.
-- 3. Lines can only be added to an entry created in the same transaction,
--    so nobody can append lines to an old entry later.

CREATE OR REPLACE FUNCTION billing_journal_balanced() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  eid text := COALESCE(NEW.entry_id, OLD.entry_id);
  dr bigint;
  cr bigint;
  n int;
BEGIN
  SELECT coalesce(sum(debit_paise), 0), coalesce(sum(credit_paise), 0), count(*)
    INTO dr, cr, n
    FROM journal_lines WHERE entry_id = eid;
  IF n < 2 OR dr <> cr THEN
    RAISE EXCEPTION 'Journal entry % does not balance (debits %, credits %, % lines)', eid, dr, cr, n
      USING ERRCODE = 'P0001', HINT = 'JOURNAL_UNBALANCED';
  END IF;
  RETURN NULL;
END
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS journal_balanced ON journal_lines;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER journal_balanced
  AFTER INSERT ON journal_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION billing_journal_balanced();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION billing_journal_immutable() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% rows are posted records and cannot be changed or deleted; post a reversing entry instead', TG_TABLE_NAME
    USING ERRCODE = 'P0001', HINT = 'DOCUMENT_LOCKED';
END
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS journal_immutable ON journal_entries;
--> statement-breakpoint
CREATE TRIGGER journal_immutable BEFORE UPDATE OR DELETE ON journal_entries FOR EACH ROW EXECUTE FUNCTION billing_journal_immutable();
--> statement-breakpoint
DROP TRIGGER IF EXISTS journal_immutable ON journal_lines;
--> statement-breakpoint
CREATE TRIGGER journal_immutable BEFORE UPDATE OR DELETE ON journal_lines FOR EACH ROW EXECUTE FUNCTION billing_journal_immutable();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION billing_journal_lines_same_tx() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  created_xid text;
BEGIN
  SELECT xmin::text INTO created_xid FROM journal_entries WHERE id = NEW.entry_id;
  -- xmin is the 32-bit id of the transaction that inserted the entry.
  IF created_xid IS DISTINCT FROM (txid_current() % 4294967296)::text THEN
    RAISE EXCEPTION 'Lines can only be added to a journal entry in the transaction that creates it'
      USING ERRCODE = 'P0001', HINT = 'DOCUMENT_LOCKED';
  END IF;
  RETURN NEW;
END
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS journal_lines_same_tx ON journal_lines;
--> statement-breakpoint
CREATE TRIGGER journal_lines_same_tx BEFORE INSERT ON journal_lines FOR EACH ROW EXECUTE FUNCTION billing_journal_lines_same_tx();
