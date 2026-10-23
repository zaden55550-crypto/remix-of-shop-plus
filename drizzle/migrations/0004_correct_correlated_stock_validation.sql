CREATE OR REPLACE FUNCTION public.shopbook_health() RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$ BEGIN PERFORM 1 FROM public.shopbook_shop_sync LIMIT 1; PERFORM 1 FROM public.shopbook_sync_operations LIMIT 1; RETURN true; END $$;
CREATE OR REPLACE FUNCTION public.validate_shopbook_stock_projection() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE p jsonb; old_product jsonb; m jsonb; old_qty numeric; next_qty numeric; delta numeric; current_payload jsonb;
BEGIN
 current_payload := CASE WHEN TG_OP = 'INSERT' THEN '{}'::jsonb ELSE OLD.payload END;
 FOR p IN SELECT value FROM jsonb_array_elements(coalesce(NEW.payload->'products','[]'::jsonb)) LOOP
  IF jsonb_typeof(p->'qty') IS DISTINCT FROM 'number' OR jsonb_typeof(p->'buy') IS DISTINCT FROM 'number' OR jsonb_typeof(p->'sell') IS DISTINCT FROM 'number' OR (p->>'qty')::numeric < 0 OR (p->>'buy')::numeric < 0 OR (p->>'sell')::numeric < 0 THEN RAISE EXCEPTION 'Invalid stock or price'; END IF;
  SELECT value INTO old_product FROM jsonb_array_elements(coalesce(current_payload->'products','[]'::jsonb)) WHERE value->>'id'=p->>'id';
  old_qty := coalesce((old_product->>'qty')::numeric,0); next_qty := (p->>'qty')::numeric; delta := 0;
  FOR m IN SELECT new_m.value FROM jsonb_array_elements(coalesce(NEW.payload->'movements','[]'::jsonb)) AS new_m(value) WHERE new_m.value->>'productId'=p->>'id' AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(current_payload->'movements','[]'::jsonb)) AS old_m(value) WHERE old_m.value->>'id'=new_m.value->>'id') LOOP
   IF jsonb_typeof(m->'qty') IS DISTINCT FROM 'number' OR jsonb_typeof(m->'prev') IS DISTINCT FROM 'number' OR jsonb_typeof(m->'next') IS DISTINCT FROM 'number' OR abs((m->>'prev')::numeric+(m->>'qty')::numeric-(m->>'next')::numeric)>0.001 OR (m->>'next')::numeric<0 THEN RAISE EXCEPTION 'Invalid audited movement'; END IF;
   delta := delta+(m->>'qty')::numeric;
  END LOOP;
  IF abs(next_qty-old_qty-delta)>0.001 THEN RAISE EXCEPTION 'SYNC_CONFLICT: stock change must equal recorded movements for %',p->>'id'; END IF;
 END LOOP;
 RETURN NEW;
END $$;