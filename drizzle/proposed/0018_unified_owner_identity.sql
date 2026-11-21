-- PROPOSED ONLY: unified owner identity and resumable local-account reconciliation.
-- Do not apply until separately approved. Existing local account hashes and business records are never copied or rewritten.

CREATE TABLE public.legacy_owner_migrations (
  legacy_business_id text PRIMARY KEY CHECK (length(trim(legacy_business_id)) BETWEEN 1 AND 160),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  owner_account_id uuid REFERENCES public.owner_accounts(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('pending', 'complete', 'manual_reconciliation')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  conflict_code text,
  UNIQUE (legacy_business_id, owner_user_id),
  CHECK ((status = 'complete') = (completed_at IS NOT NULL))
);
CREATE INDEX legacy_owner_migrations_owner ON public.legacy_owner_migrations(owner_user_id, requested_at DESC);
ALTER TABLE public.legacy_owner_migrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY legacy_owner_migrations_read ON public.legacy_owner_migrations
  FOR SELECT TO authenticated USING (owner_user_id = auth.uid());
REVOKE ALL ON public.legacy_owner_migrations FROM anon, authenticated;
GRANT SELECT ON public.legacy_owner_migrations TO authenticated;

-- Supabase Auth remains authoritative for identities. This table records provider link presence without storing emails,
-- passwords, tokens, or provider secrets.
CREATE TABLE public.owner_identity_link_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  provider text NOT NULL CHECK (provider IN ('email', 'google', 'apple')),
  provider_identity_id uuid NOT NULL,
  linked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, provider, provider_identity_id)
);
ALTER TABLE public.owner_identity_link_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_identity_link_audit_read ON public.owner_identity_link_audit
  FOR SELECT TO authenticated USING (owner_user_id = auth.uid());
REVOKE ALL ON public.owner_identity_link_audit FROM anon, authenticated;
GRANT SELECT ON public.owner_identity_link_audit TO authenticated;

CREATE OR REPLACE FUNCTION public.record_owner_identity_link(p_provider text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); verified boolean; added integer;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
 IF p_provider NOT IN ('email', 'google', 'apple') THEN RAISE EXCEPTION 'PROVIDER_NOT_SUPPORTED'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.owner_accounts WHERE owner_user_id = uid) THEN RAISE EXCEPTION 'OWNER_IDENTITY_REQUIRED'; END IF;
 SELECT u.email_confirmed_at IS NOT NULL INTO verified FROM auth.users u WHERE u.id = uid;
 IF NOT coalesce(verified, false) THEN RAISE EXCEPTION 'CENTRAL_IDENTITY_UNVERIFIED'; END IF;
 INSERT INTO public.owner_identity_link_audit(owner_user_id, provider, provider_identity_id)
 SELECT uid, i.provider, i.id FROM auth.identities i WHERE i.user_id = uid AND i.provider = p_provider
 ON CONFLICT (owner_user_id, provider, provider_identity_id) DO NOTHING;
 GET DIAGNOSTICS added = ROW_COUNT;
 IF added = 0 AND NOT EXISTS (SELECT 1 FROM auth.identities i WHERE i.user_id = uid AND i.provider = p_provider) THEN RAISE EXCEPTION 'PROVIDER_IDENTITY_NOT_LINKED'; END IF;
 RETURN added;
END $$;
REVOKE ALL ON FUNCTION public.record_owner_identity_link(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_owner_identity_link(text) TO authenticated;

-- The browser must first verify the existing local password and require an explicit confirmation.
-- This function independently verifies the central Supabase identity and all server-side ownership conflicts.
CREATE OR REPLACE FUNCTION public.reconcile_legacy_owner(p_legacy_business text, p_business_name text, p_currency text, p_country text, p_confirm boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); verified boolean; acc uuid; biz uuid; old public.legacy_owner_migrations; sync_business text;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
 IF p_confirm IS DISTINCT FROM true THEN RAISE EXCEPTION 'OWNER_CONFIRMATION_REQUIRED'; END IF;
 IF p_legacy_business IS NULL OR length(trim(p_legacy_business)) NOT BETWEEN 1 AND 160 THEN RAISE EXCEPTION 'INVALID_LEGACY_ACCOUNT'; END IF;
 IF p_business_name IS NULL OR length(trim(p_business_name)) NOT BETWEEN 1 AND 160 OR p_currency IS NULL OR length(trim(p_currency)) NOT BETWEEN 1 AND 12 THEN RAISE EXCEPTION 'INVALID_BUSINESS_DETAILS'; END IF;
 SELECT u.email_confirmed_at IS NOT NULL INTO verified FROM auth.users u WHERE u.id = uid;
 IF NOT coalesce(verified, false) THEN RAISE EXCEPTION 'CENTRAL_IDENTITY_UNVERIFIED'; END IF;
 IF EXISTS (SELECT 1 FROM public.owner_members m WHERE m.user_id = uid AND m.status = 'active')
    AND NOT EXISTS (SELECT 1 FROM public.owner_accounts a WHERE a.owner_user_id = uid) THEN
   RAISE EXCEPTION 'IDENTITY_BELONGS_TO_EMPLOYEE';
 END IF;
 SELECT * INTO old FROM public.legacy_owner_migrations WHERE legacy_business_id = trim(p_legacy_business) FOR UPDATE;
 IF FOUND AND old.owner_user_id <> uid THEN
   RETURN jsonb_build_object('status', 'manual_reconciliation', 'reason', 'LEGACY_ACCOUNT_ALREADY_CLAIMED');
 END IF;
 IF EXISTS (SELECT 1 FROM public.businesses b WHERE b.legacy_business_id = trim(p_legacy_business)
            AND NOT EXISTS (SELECT 1 FROM public.owner_accounts a WHERE a.id = b.owner_account_id AND a.owner_user_id = uid)) THEN
   INSERT INTO public.legacy_owner_migrations(legacy_business_id, owner_user_id, status, conflict_code)
   VALUES (trim(p_legacy_business), uid, 'manual_reconciliation', 'BUSINESS_OWNERSHIP_CONFLICT')
   ON CONFLICT (legacy_business_id) DO UPDATE SET status = 'manual_reconciliation', conflict_code = 'BUSINESS_OWNERSHIP_CONFLICT'
   WHERE public.legacy_owner_migrations.owner_user_id = uid;
   RETURN jsonb_build_object('status', 'manual_reconciliation', 'reason', 'BUSINESS_OWNERSHIP_CONFLICT');
 END IF;
 SELECT business_id INTO sync_business FROM public.shopbook_sync_business WHERE user_id = uid;
 IF sync_business IS NOT NULL AND sync_business <> trim(p_legacy_business) THEN
   INSERT INTO public.legacy_owner_migrations(legacy_business_id, owner_user_id, status, conflict_code)
   VALUES (trim(p_legacy_business), uid, 'manual_reconciliation', 'SYNC_BUSINESS_CONFLICT')
   ON CONFLICT (legacy_business_id) DO UPDATE SET status = 'manual_reconciliation', conflict_code = 'SYNC_BUSINESS_CONFLICT'
   WHERE public.legacy_owner_migrations.owner_user_id = uid;
   RETURN jsonb_build_object('status', 'manual_reconciliation', 'reason', 'SYNC_BUSINESS_CONFLICT');
 END IF;
 INSERT INTO public.legacy_owner_migrations(legacy_business_id, owner_user_id, status)
 VALUES (trim(p_legacy_business), uid, 'pending')
 ON CONFLICT (legacy_business_id) DO UPDATE SET requested_at = now()
 WHERE public.legacy_owner_migrations.owner_user_id = uid;
 acc := public.ensure_owner_account('SHOP PLUS+ owner', 'SHOP PLUS+ owner');
 IF EXISTS (SELECT 1 FROM public.businesses b WHERE b.legacy_business_id = trim(p_legacy_business) AND b.owner_account_id <> acc) THEN
   RETURN jsonb_build_object('status', 'manual_reconciliation', 'reason', 'BUSINESS_OWNERSHIP_CONFLICT');
 END IF;
 SELECT b.id INTO biz FROM public.businesses b WHERE b.legacy_business_id = trim(p_legacy_business) AND b.owner_account_id = acc;
 IF biz IS NULL THEN
   -- Existing ERP records remain on-device. This creates only the central account/business binding.
   biz := public.create_business(acc, trim(p_business_name), upper(trim(p_currency)), nullif(trim(p_country), ''), NULL);
   UPDATE public.businesses SET legacy_business_id = trim(p_legacy_business) WHERE id = biz;
 END IF;
 UPDATE public.legacy_owner_migrations SET owner_account_id = acc, status = 'complete', completed_at = coalesce(completed_at, now()), conflict_code = NULL
 WHERE legacy_business_id = trim(p_legacy_business) AND owner_user_id = uid;
 RETURN jsonb_build_object('status', 'complete', 'account', acc, 'business', biz);
END $$;

REVOKE ALL ON FUNCTION public.reconcile_legacy_owner(text, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_legacy_owner(text, text, text, text, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.owner_migration_status(p_legacy_business text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); m public.legacy_owner_migrations;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
 SELECT * INTO m FROM public.legacy_owner_migrations WHERE legacy_business_id = trim(p_legacy_business);
 IF NOT FOUND THEN RETURN jsonb_build_object('status', 'not_started'); END IF;
 IF m.owner_user_id <> uid THEN RETURN jsonb_build_object('status', 'manual_reconciliation', 'reason', 'LEGACY_ACCOUNT_ALREADY_CLAIMED'); END IF;
 RETURN jsonb_build_object('status', m.status, 'account', m.owner_account_id, 'reason', m.conflict_code, 'updatedAt', m.requested_at);
END $$;
REVOKE ALL ON FUNCTION public.owner_migration_status(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.owner_migration_status(text) TO authenticated;

-- Remove the old implicit local-business association. Existing mapped businesses remain readable;
-- every new local account mapping must go through reconcile_legacy_owner.
CREATE OR REPLACE FUNCTION public.connect_owner(p_account_name text, p_full_name text, p_legacy_business text, p_business_name text, p_currency text, p_country text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); acc uuid; biz uuid; verified boolean;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
 SELECT u.email_confirmed_at IS NOT NULL INTO verified FROM auth.users u WHERE u.id = uid;
 IF NOT coalesce(verified, false) THEN RAISE EXCEPTION 'CENTRAL_IDENTITY_UNVERIFIED'; END IF;
 SELECT id INTO acc FROM public.owner_accounts WHERE owner_user_id = uid;
 IF acc IS NULL THEN RAISE EXCEPTION 'OWNER_MIGRATION_REQUIRED'; END IF;
 SELECT id INTO biz FROM public.businesses WHERE owner_account_id = acc AND legacy_business_id = p_legacy_business;
 IF biz IS NULL THEN RAISE EXCEPTION 'OWNER_MIGRATION_REQUIRED'; END IF;
 RETURN jsonb_build_object('account', acc, 'business', biz);
END $$;
