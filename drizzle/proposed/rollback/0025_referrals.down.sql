-- Reverses proposed 0025. Referral codes and who joined through them are removed.
DROP FUNCTION IF EXISTS public.record_referral(text);
DROP FUNCTION IF EXISTS public.my_referral_code();
DROP TABLE IF EXISTS public.referrals;
DROP TABLE IF EXISTS public.referral_codes;
