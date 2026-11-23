-- ZAKRIO SYSTEMS additions, 2026-11-23. Run this ONLY if you already ran APPLY-2026-11-22.sql before 2026-11-23.
-- (If you never ran it, run APPLY-2026-11-22.sql instead: it already contains everything below.)
-- It brings an earlier run up to date: more payment providers in Connections (Airtel Money, MTN MoMo, Orange Money, EVC Plus,
-- other providers) and the plan_payments table for real M-Pesa plan payments. Safe to run more than once. One transaction.
-- Rehearsed by src/test/bundle-rehearsal.test.ts.
BEGIN;

-- 1. Connections: allow the new payment providers.
ALTER TABLE public.business_integrations DROP CONSTRAINT IF EXISTS business_integrations_kind_check;
ALTER TABLE public.business_integrations ADD CONSTRAINT business_integrations_kind_check
  CHECK (kind IN ('mpesa', 'airtel', 'mtn', 'orange', 'evc', 'otherpay', 'whatsapp', 'sms', 'etims'));

CREATE OR REPLACE FUNCTION public.save_business_integration(p_kind text, p_config jsonb, p_enabled boolean, p_accept boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Sign-in required'; END IF;
  IF p_kind NOT IN ('mpesa', 'airtel', 'mtn', 'orange', 'evc', 'otherpay', 'whatsapp', 'sms', 'etims') THEN RAISE EXCEPTION 'Unknown connection'; END IF;
  IF NOT coalesce(p_accept, false) THEN RAISE EXCEPTION 'Accept the terms first'; END IF;
  IF jsonb_typeof(p_config) <> 'object' OR octet_length(p_config::text) > 8000 THEN RAISE EXCEPTION 'Invalid details'; END IF;
  INSERT INTO public.business_integrations (owner_id, kind, config, enabled, accepted_terms_at, updated_at)
  VALUES (me, p_kind, p_config, coalesce(p_enabled, true), now(), now())
  ON CONFLICT (owner_id, kind) DO UPDATE SET
    config = public.business_integrations.config || (SELECT coalesce(jsonb_object_agg(key, value), '{}'::jsonb) FROM jsonb_each(p_config) WHERE value <> '""'::jsonb),
    enabled = excluded.enabled, accepted_terms_at = now(), updated_at = now();
END $$;
REVOKE ALL ON FUNCTION public.save_business_integration(text, jsonb, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_business_integration(text, jsonb, boolean, boolean) TO authenticated;

-- 2. Real plan payments (proposed 0024).
CREATE TABLE IF NOT EXISTS public.plan_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  plan_id text NOT NULL CHECK (plan_id IN ('basic', 'growth', 'business')),
  billing text NOT NULL CHECK (billing IN ('monthly', 'yearly')),
  amount_kes numeric NOT NULL CHECK (amount_kes > 0),
  phone text NOT NULL,
  checkout_request_id text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed')),
  receipt text,
  result_desc text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS plan_payments_owner_idx ON public.plan_payments (owner_id, created_at DESC);
ALTER TABLE public.plan_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Owners read their plan payments" ON public.plan_payments;
CREATE POLICY "Owners read their plan payments" ON public.plan_payments FOR SELECT TO authenticated USING (owner_id = auth.uid());
REVOKE ALL ON public.plan_payments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.plan_payments TO authenticated;
GRANT ALL ON public.plan_payments TO service_role;

-- 3. Invite a shop, get a free month (proposed 0025). Skipped if already there.
DO $do$ BEGIN IF to_regclass('public.referral_codes') IS NULL THEN
EXECUTE $sql$-- PROPOSED 0025 (owner approval needed; needs 0024 for the "paid" count): invite a shop, get a free month.
-- Every owner gets one short code (my_referral_code). A new owner who signed up through a link records it once (record_referral);
-- nobody can refer themselves or change it later. An owner sees how many shops joined and how many have paid. The free month is
-- given by Zakrio Systems support (rewarded_at), not automatically, so it can be checked first.
-- Rollback: drizzle/proposed/rollback/0025_referrals.down.sql.

CREATE TABLE public.referral_codes (
  owner_id uuid PRIMARY KEY,
  code text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9]{6}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.referrals (
  referred_owner uuid PRIMARY KEY,
  referrer_owner uuid NOT NULL,
  code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  rewarded_at timestamptz,
  CHECK (referred_owner <> referrer_owner)
);
CREATE INDEX referrals_referrer_idx ON public.referrals (referrer_owner);
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.referral_codes, public.referrals FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.referral_codes, public.referrals TO service_role;

/** The signed-in owner's code (made on first ask) and how many shops joined with it and have paid. */
CREATE FUNCTION public.my_referral_code()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid(); c text; tries int := 0; joined int; paid int;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Sign-in required'; END IF;
  SELECT code INTO c FROM referral_codes WHERE owner_id = me;
  WHILE c IS NULL LOOP
    tries := tries + 1;
    c := upper(substr(md5(random()::text || clock_timestamp()::text || me::text), 1, 6));
    IF length(c) <> 6 OR EXISTS (SELECT 1 FROM referral_codes WHERE code = c) THEN c := NULL; ELSE INSERT INTO referral_codes (owner_id, code) VALUES (me, c); END IF;
    IF tries > 20 THEN RAISE EXCEPTION 'Could not make a code'; END IF;
  END LOOP;
  SELECT count(*) INTO joined FROM referrals WHERE referrer_owner = me;
  SELECT count(DISTINCT r.referred_owner) INTO paid FROM referrals r JOIN plan_payments p ON p.owner_id = r.referred_owner AND p.status = 'paid' WHERE r.referrer_owner = me;
  RETURN jsonb_build_object('code', c, 'joined', joined, 'paid', paid);
END $$;

/** Records once that the signed-in (new) owner came through this code. Unknown codes and one's own code are ignored. */
CREATE FUNCTION public.record_referral(p_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid(); ref uuid;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Sign-in required'; END IF;
  SELECT owner_id INTO ref FROM referral_codes WHERE code = upper(trim(p_code));
  IF ref IS NULL OR ref = me THEN RETURN false; END IF;
  INSERT INTO referrals (referred_owner, referrer_owner, code) VALUES (me, ref, upper(trim(p_code))) ON CONFLICT (referred_owner) DO NOTHING;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.my_referral_code(), public.record_referral(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_referral_code(), public.record_referral(text) TO authenticated;
$sql$;
END IF; END $do$;

COMMIT;
