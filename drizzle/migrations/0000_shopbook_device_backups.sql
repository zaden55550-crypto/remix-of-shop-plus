CREATE TABLE public.shopbook_device_backups (
 user_id uuid NOT NULL,
 device_id uuid NOT NULL,
 revision bigint NOT NULL DEFAULT 0,
 shop_name text NOT NULL DEFAULT '',
 payload jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (user_id, device_id),
 CONSTRAINT payload_size CHECK (octet_length(payload::text) <= 15000000)
);
GRANT SELECT, INSERT, UPDATE ON public.shopbook_device_backups TO authenticated;
GRANT ALL ON public.shopbook_device_backups TO service_role;
ALTER TABLE public.shopbook_device_backups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read their device backups" ON public.shopbook_device_backups FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Owners save their device backups" ON public.shopbook_device_backups FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owners update their device backups" ON public.shopbook_device_backups FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE FUNCTION public.protect_shopbook_backup_revision() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN IF NEW.revision < OLD.revision THEN RETURN OLD; END IF; NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TRIGGER protect_shopbook_backup_revision BEFORE UPDATE ON public.shopbook_device_backups FOR EACH ROW EXECUTE FUNCTION public.protect_shopbook_backup_revision();