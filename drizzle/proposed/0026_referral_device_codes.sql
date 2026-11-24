-- PROPOSED 0026 (owner approval needed; needs 0025 and 0024): invite links work before the owner is online (owner, 2026-11-24).
-- The app shows every owner an invite link at once, with a code made on the device. claim_referral_code(code) makes that code the
-- owner's own on the server (or returns the code they already have; a code someone else holds gets a fresh one). A shop that signs
-- up with a code nobody has claimed yet is kept in pending_referrals and counted for the owner as soon as they claim it.
-- Free months by the inviter's plan are worked out in the app (Basic: every 2 paying shops, Growth: 3, Business: 5); only shops with
-- a paid plan payment count. Support still gives the month (referrals.rewarded_at).
-- Safe to run more than once. Rollback: drizzle/proposed/rollback/0026_referral_device_codes.down.sql.

CREATE TABLE IF NOT EXISTS public.pending_referrals (
  referred_owner uuid PRIMARY KEY,
  code text NOT NULL CHECK (code ~ '^[A-Z0-9]{6}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pending_referrals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pending_referrals FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.pending_referrals TO service_role;

/** Makes the device's code the signed-in owner's code when they have none yet; moves waiting sign-ups over; returns the counts. */
CREATE OR REPLACE FUNCTION public.claim_referral_code(p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid(); want text := upper(trim(coalesce(p_code, ''))); c text; joined int; paid int; tries int := 0;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Sign-in required'; END IF;
  SELECT code INTO c FROM referral_codes WHERE owner_id = me;
  IF c IS NULL AND want ~ '^[A-Z0-9]{6}$' AND NOT EXISTS (SELECT 1 FROM referral_codes WHERE code = want) THEN
    INSERT INTO referral_codes (owner_id, code) VALUES (me, want) ON CONFLICT DO NOTHING;
    SELECT code INTO c FROM referral_codes WHERE owner_id = me;
  END IF;
  WHILE c IS NULL LOOP
    tries := tries + 1;
    c := upper(substr(md5(random()::text || clock_timestamp()::text || me::text), 1, 6));
    IF EXISTS (SELECT 1 FROM referral_codes WHERE code = c) THEN c := NULL; ELSE INSERT INTO referral_codes (owner_id, code) VALUES (me, c); END IF;
    IF tries > 20 THEN RAISE EXCEPTION 'Could not make a code'; END IF;
  END LOOP;
  -- Shops that signed up with this code before it was claimed now count (never the owner themselves).
  INSERT INTO referrals (referred_owner, referrer_owner, code)
    SELECT p.referred_owner, me, p.code FROM pending_referrals p WHERE p.code = c AND p.referred_owner <> me
    ON CONFLICT (referred_owner) DO NOTHING;
  DELETE FROM pending_referrals WHERE code = c;
  SELECT count(*) INTO joined FROM referrals WHERE referrer_owner = me;
  SELECT count(DISTINCT r.referred_owner) INTO paid FROM referrals r JOIN plan_payments p ON p.owner_id = r.referred_owner AND p.status = 'paid' WHERE r.referrer_owner = me;
  RETURN jsonb_build_object('code', c, 'joined', joined, 'paid', paid);
END $$;

/** As 0025, and a well-formed code nobody has claimed yet waits in pending_referrals instead of being lost. */
CREATE OR REPLACE FUNCTION public.record_referral(p_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid(); code_in text := upper(trim(coalesce(p_code, ''))); ref uuid;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Sign-in required'; END IF;
  IF code_in !~ '^[A-Z0-9]{6}$' THEN RETURN false; END IF;
  SELECT owner_id INTO ref FROM referral_codes WHERE code = code_in;
  IF ref = me THEN RETURN false; END IF;
  IF ref IS NULL THEN
    IF EXISTS (SELECT 1 FROM referrals WHERE referred_owner = me) THEN RETURN false; END IF;
    INSERT INTO pending_referrals (referred_owner, code) VALUES (me, code_in) ON CONFLICT (referred_owner) DO NOTHING;
    RETURN true;
  END IF;
  INSERT INTO referrals (referred_owner, referrer_owner, code) VALUES (me, ref, code_in) ON CONFLICT (referred_owner) DO NOTHING;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.claim_referral_code(text), public.record_referral(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_referral_code(text), public.record_referral(text) TO authenticated;
