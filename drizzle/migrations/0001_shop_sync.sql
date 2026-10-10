CREATE TABLE public.shopbook_shop_sync (
  user_id uuid PRIMARY KEY,
  revision bigint NOT NULL DEFAULT 0,
  device_id uuid NOT NULL,
  payload jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.shopbook_shop_sync TO authenticated;
GRANT ALL ON public.shopbook_shop_sync TO service_role;
ALTER TABLE public.shopbook_shop_sync ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner reads shop sync" ON public.shopbook_shop_sync FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "owner creates shop sync" ON public.shopbook_shop_sync FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner updates shop sync" ON public.shopbook_shop_sync FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE OR REPLACE FUNCTION public.touch_shop_sync() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TRIGGER touch_shop_sync BEFORE UPDATE ON public.shopbook_shop_sync FOR EACH ROW EXECUTE FUNCTION public.touch_shop_sync();
ALTER PUBLICATION supabase_realtime ADD TABLE public.shopbook_shop_sync;