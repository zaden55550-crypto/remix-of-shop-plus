-- Reverses proposed 0023. Saved connection details and M-Pesa payment results are removed with their tables.
DROP FUNCTION IF EXISTS public.business_integration_status();
DROP FUNCTION IF EXISTS public.save_business_integration(text, jsonb, boolean, boolean);
DROP TABLE IF EXISTS public.mpesa_payments;
DROP TABLE IF EXISTS public.business_integrations;
DROP FUNCTION IF EXISTS public.public_shop_catalog(text);
DROP FUNCTION IF EXISTS public.set_public_shop(text, text, text, boolean);
DROP TABLE IF EXISTS public.public_shops;
