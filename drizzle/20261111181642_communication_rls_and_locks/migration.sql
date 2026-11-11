-- Communication (Stage 14b): row-level security for share links and the
-- sent-messages log.
--
-- document_shares has one extra rule: a request that holds a share token
-- (app.share_token = the token's SHA-256 hash, set by withShareToken in
-- lib/business-billing/communication/shares.ts) may READ the one row with
-- that hash, and nothing else. Everything after that runs as the owning
-- tenant (withTenant), so the public link page sees no other data.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['document_shares', 'billing_messages']
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
DROP POLICY IF EXISTS share_token_lookup ON document_shares;
--> statement-breakpoint
CREATE POLICY share_token_lookup ON document_shares AS PERMISSIVE FOR SELECT TO PUBLIC
  USING (current_setting('app.share_token', true) IS NOT NULL
         AND current_setting('app.share_token', true) <> ''
         AND token_hash = current_setting('app.share_token', true));
