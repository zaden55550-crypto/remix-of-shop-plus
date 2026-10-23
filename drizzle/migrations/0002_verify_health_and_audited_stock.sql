CREATE OR REPLACE FUNCTION public.shopbook_health() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT EXISTS (SELECT 1 FROM pg_catalog.pg_class WHERE oid = 'public.shopbook_shop_sync'::regclass) AND EXISTS (SELECT 1 FROM pg_catalog.pg_class WHERE oid = 'public.shopbook_sync_operations'::regclass) $$;
REVOKE ALL ON FUNCTION public.shopbook_health() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.shopbook_health() TO anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.validate_shopbook_stock_projection() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE p jsonb; old_product jsonb; m jsonb; old_qty numeric; next_qty numeric; delta numeric; prev_qty numeric; movement_count integer; current_payload jsonb;
BEGIN
 current_payload := CASE WHEN TG_OP = 'INSERT' THEN '{}'::jsonb ELSE OLD.payload END;
 FOR p IN SELECT value FROM jsonb_array_elements(coalesce(NEW.payload->'products','[]'::jsonb)) LOOP
  IF jsonb_typeof(p->'qty') IS DISTINCT FROM 'number' OR jsonb_typeof(p->'buy') IS DISTINCT FROM 'number' OR jsonb_typeof(p->'sell') IS DISTINCT FROM 'number' OR (p->>'qty')::numeric < 0 OR (p->>'buy')::numeric < 0 OR (p->>'sell')::numeric < 0 THEN RAISE EXCEPTION 'Invalid stock or price'; END IF;
  SELECT value INTO old_product FROM jsonb_array_elements(coalesce(current_payload->'products','[]'::jsonb)) WHERE value->>'id'=p->>'id';
  old_qty := coalesce((old_product->>'qty')::numeric,0); next_qty := (p->>'qty')::numeric; delta := 0; movement_count := 0;
  FOR m IN SELECT value FROM jsonb_array_elements(coalesce(NEW.payload->'movements','[]'::jsonb)) WHERE value->>'productId'=p->>'id' AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(current_payload->'movements','[]'::jsonb)) old_m WHERE old_m->>'id'=value->>'id') LOOP
   IF jsonb_typeof(m->'qty') IS DISTINCT FROM 'number' OR jsonb_typeof(m->'prev') IS DISTINCT FROM 'number' OR jsonb_typeof(m->'next') IS DISTINCT FROM 'number' OR abs((m->>'prev')::numeric+(m->>'qty')::numeric-(m->>'next')::numeric)>0.001 OR (m->>'next')::numeric<0 THEN RAISE EXCEPTION 'Invalid audited movement'; END IF;
   delta := delta+(m->>'qty')::numeric; movement_count := movement_count+1;
  END LOOP;
  IF abs(next_qty-old_qty-delta)>0.001 THEN RAISE EXCEPTION 'SYNC_CONFLICT: stock change must equal recorded movements for %',p->>'id'; END IF;
 END LOOP;
 RETURN NEW;
END $$;
CREATE TRIGGER validate_shopbook_stock_projection BEFORE INSERT OR UPDATE OF payload ON public.shopbook_shop_sync FOR EACH ROW EXECUTE FUNCTION public.validate_shopbook_stock_projection();
REVOKE INSERT, UPDATE ON public.shopbook_shop_sync FROM authenticated;
COMMENT ON FUNCTION public.validate_shopbook_stock_projection() IS 'Stock projection changes require matching newly recorded audited movements. Concurrent operation before-values are checked by apply_shopbook_operation.';