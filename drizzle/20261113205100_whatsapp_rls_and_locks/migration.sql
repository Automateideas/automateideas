-- WhatsApp (Stage 14d): row-level security for company connections, and the
-- one narrow function the Meta webhook uses to record delivery statuses.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['whatsapp_connections']
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
-- Meta's status webhooks name only its own message id, not the company. This
-- function (run with its owner's rights) can do exactly one thing: move a
-- WhatsApp message's status forward (sent -> delivered -> read, or failed),
-- never backwards, and never touch anything else.
CREATE OR REPLACE FUNCTION billing_whatsapp_status(p_message_id text, p_status text, p_error text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  rank_new integer := CASE p_status WHEN 'sent' THEN 1 WHEN 'delivered' THEN 2 WHEN 'read' THEN 3 WHEN 'failed' THEN 4 ELSE 0 END;
  n integer;
BEGIN
  IF rank_new = 0 OR p_message_id IS NULL OR p_message_id = '' THEN
    RETURN 0;
  END IF;
  UPDATE billing_messages m
     SET status = p_status,
         error = CASE WHEN p_status = 'failed' THEN left(p_error, 500) ELSE m.error END,
         updated_at = now()
   WHERE m.channel = 'whatsapp'
     AND m.provider_message_id = p_message_id
     AND (CASE m.status WHEN 'sent' THEN 1 WHEN 'delivered' THEN 2 WHEN 'read' THEN 3 WHEN 'failed' THEN 4 ELSE 0 END) < rank_new;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION billing_whatsapp_status(text, text, text) FROM PUBLIC;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS billing_messages_provider_idx ON billing_messages (provider_message_id) WHERE provider_message_id IS NOT NULL;
