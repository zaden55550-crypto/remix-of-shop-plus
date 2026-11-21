-- PROPOSED ROLLBACK ONLY: removes only the new reconciliation interface and status table.
-- It intentionally preserves owner accounts, businesses, local records and all employee data.
REVOKE ALL ON FUNCTION public.reconcile_legacy_owner(text, text, text, text, boolean) FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS public.reconcile_legacy_owner(text, text, text, text, boolean);
REVOKE ALL ON FUNCTION public.owner_migration_status(text) FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS public.owner_migration_status(text);
REVOKE ALL ON FUNCTION public.record_owner_identity_link(text) FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS public.record_owner_identity_link(text);
DROP TABLE IF EXISTS public.owner_identity_link_audit;
DROP TABLE IF EXISTS public.legacy_owner_migrations;

-- Restore the pre-proposal connect_owner behavior from migration 0009.
CREATE OR REPLACE FUNCTION public.connect_owner(p_account_name text, p_full_name text, p_legacy_business text, p_business_name text, p_currency text, p_country text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE acc uuid; b uuid;
BEGIN
 acc := ensure_owner_account(p_account_name, p_full_name);
 SELECT id INTO b FROM businesses WHERE legacy_business_id = p_legacy_business AND owner_account_id = acc;
 IF NOT FOUND THEN
  IF EXISTS (SELECT 1 FROM businesses WHERE legacy_business_id = p_legacy_business) THEN RAISE EXCEPTION 'This business is linked to another owner'; END IF;
  b := create_business(acc, p_business_name, p_currency, p_country);
  UPDATE businesses SET legacy_business_id = p_legacy_business WHERE id = b;
 END IF;
 RETURN jsonb_build_object('account', acc, 'business', b);
END $$;
