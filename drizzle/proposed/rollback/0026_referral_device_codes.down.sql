-- Reverses proposed 0026: drops claim_referral_code and the waiting sign-ups, and puts 0025's record_referral back.
DROP FUNCTION IF EXISTS public.claim_referral_code(text);
DROP TABLE IF EXISTS public.pending_referrals;
CREATE OR REPLACE FUNCTION public.record_referral(p_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid(); ref uuid;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Sign-in required'; END IF;
  SELECT owner_id INTO ref FROM referral_codes WHERE code = upper(trim(p_code));
  IF ref IS NULL OR ref = me THEN RETURN false; END IF;
  INSERT INTO referrals (referred_owner, referrer_owner, code) VALUES (me, ref, upper(trim(p_code))) ON CONFLICT (referred_owner) DO NOTHING;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.record_referral(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_referral(text) TO authenticated;
