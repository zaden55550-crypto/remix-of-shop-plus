CREATE TABLE public.shopbook_sync_business (user_id uuid PRIMARY KEY, business_id text NOT NULL);
GRANT SELECT ON public.shopbook_sync_business TO authenticated;
GRANT ALL ON public.shopbook_sync_business TO service_role;
ALTER TABLE public.shopbook_sync_business ENABLE ROW LEVEL SECURITY;
CREATE POLICY owner_reads_sync_business ON public.shopbook_sync_business FOR SELECT TO authenticated USING (auth.uid()=user_id);
CREATE OR REPLACE FUNCTION public.bind_shopbook_sync_business() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE bound text;
BEGIN
 INSERT INTO public.shopbook_sync_business(user_id,business_id) VALUES(NEW.user_id,NEW.business_id) ON CONFLICT(user_id) DO NOTHING;
 SELECT business_id INTO bound FROM public.shopbook_sync_business WHERE user_id=NEW.user_id;
 IF bound IS DISTINCT FROM NEW.business_id THEN RAISE EXCEPTION 'SYNC_CONFLICT: owner projection belongs to another business; explicit linking required'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER bind_shopbook_sync_business BEFORE INSERT ON public.shopbook_sync_operations FOR EACH ROW EXECUTE FUNCTION public.bind_shopbook_sync_business();