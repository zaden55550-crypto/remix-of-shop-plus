-- PROPOSED 0023 (owner approval needed; independent of the others): each business connects its OWN accounts.
-- M-Pesa Daraja, WhatsApp Business (Cloud API), SMS (Africa's Talking) and KRA eTIMS details are saved by the owner from Settings ›
-- Finance › Connections and kept here, on the server only: no policy lets a browser read them back, and the app is only told which
-- connections exist. Server functions (src/lib/integrations.functions.ts) read them with the service role to call the provider.
-- M-Pesa payment results arrive at /api/mpesa-callback and are kept in mpesa_payments, readable by the owner they belong to.
-- Rollback: drizzle/proposed/rollback/0023_business_integrations.down.sql.

CREATE TABLE public.business_integrations (
  owner_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('mpesa', 'airtel', 'mtn', 'orange', 'evc', 'otherpay', 'whatsapp', 'sms', 'etims')),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  accepted_terms_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, kind)
);
ALTER TABLE public.business_integrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.business_integrations FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.business_integrations TO service_role;

CREATE FUNCTION public.save_business_integration(p_kind text, p_config jsonb, p_enabled boolean, p_accept boolean)
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
    -- A field sent empty keeps its saved value, so secrets never have to be typed again to change one setting.
    config = public.business_integrations.config || (SELECT coalesce(jsonb_object_agg(key, value), '{}'::jsonb) FROM jsonb_each(p_config) WHERE value <> '""'::jsonb),
    enabled = excluded.enabled, accepted_terms_at = now(), updated_at = now();
END $$;

/** Which connections the signed-in owner has, and which fields are filled in. Never the values. */
CREATE FUNCTION public.business_integration_status()
RETURNS TABLE (kind text, enabled boolean, updated_at timestamptz, fields text[]) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.kind, i.enabled, i.updated_at, ARRAY(SELECT k FROM jsonb_object_keys(i.config) k ORDER BY k)
  FROM public.business_integrations i WHERE i.owner_id = auth.uid()
$$;
REVOKE ALL ON FUNCTION public.save_business_integration(text, jsonb, boolean, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.business_integration_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_business_integration(text, jsonb, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.business_integration_status() TO authenticated;

CREATE TABLE public.mpesa_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  checkout_request_id text UNIQUE,
  merchant_request_id text,
  amount numeric NOT NULL CHECK (amount > 0),
  phone text NOT NULL,
  reference text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed')),
  receipt text,
  result_desc text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mpesa_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read their M-Pesa payments" ON public.mpesa_payments FOR SELECT TO authenticated USING (owner_id = auth.uid());
REVOKE ALL ON public.mpesa_payments FROM PUBLIC, anon;
GRANT SELECT ON public.mpesa_payments TO authenticated;
GRANT ALL ON public.mpesa_payments TO service_role;

-- Online shop link: an owner can publish a simple product page at /shop/<slug>. Only name, price, unit and whether it is in stock are
-- shown, and only while the owner has it switched on. Nothing else in the business's records is readable through it.
CREATE TABLE public.public_shops (
  owner_id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{2,39}$'),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 80),
  whatsapp text CHECK (whatsapp IS NULL OR whatsapp ~ '^[0-9]{9,15}$'),
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.public_shops ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read their shop page" ON public.public_shops FOR SELECT TO authenticated USING (owner_id = auth.uid());
REVOKE ALL ON public.public_shops FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.public_shops TO authenticated;
GRANT ALL ON public.public_shops TO service_role;

CREATE FUNCTION public.set_public_shop(p_slug text, p_title text, p_whatsapp text, p_enabled boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Sign-in required'; END IF;
  IF EXISTS (SELECT 1 FROM public.public_shops WHERE slug = lower(p_slug) AND owner_id <> me) THEN RAISE EXCEPTION 'That link is taken; choose another'; END IF;
  INSERT INTO public.public_shops (owner_id, slug, title, whatsapp, enabled, updated_at)
  VALUES (me, lower(p_slug), p_title, nullif(p_whatsapp, ''), coalesce(p_enabled, true), now())
  ON CONFLICT (owner_id) DO UPDATE SET slug = excluded.slug, title = excluded.title, whatsapp = excluded.whatsapp, enabled = excluded.enabled, updated_at = now();
END $$;

/* The public page's data: the shop's title and WhatsApp, and its products (not archived) with price, unit and in-stock only. */
CREATE FUNCTION public.public_shop_catalog(p_slug text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('title', p.title, 'whatsapp', p.whatsapp, 'products', coalesce((
    SELECT jsonb_agg(jsonb_build_object('name', x->>'name', 'price', (x->>'sell')::numeric, 'unit', x->>'unit', 'inStock', coalesce((x->>'qty')::numeric, 0) > 0) ORDER BY x->>'name')
    FROM jsonb_array_elements(coalesce(s.payload->'products', '[]'::jsonb)) x WHERE coalesce((x->>'archived')::boolean, false) = false), '[]'::jsonb))
  FROM public.public_shops p LEFT JOIN public.shopbook_shop_sync s ON s.user_id = p.owner_id
  WHERE p.slug = lower(p_slug) AND p.enabled
$$;
REVOKE ALL ON FUNCTION public.set_public_shop(text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_public_shop(text, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.public_shop_catalog(text) TO anon, authenticated;
