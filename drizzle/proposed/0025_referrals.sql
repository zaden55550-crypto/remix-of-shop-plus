-- PROPOSED 0025 (owner approval needed; needs 0024 for the "paid" count): invite a shop, get a free month.
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
