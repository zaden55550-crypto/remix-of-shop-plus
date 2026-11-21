-- PROPOSED: not deployed. This folder is not in the migration journal, so nothing applies it. Move it to drizzle/migrations only after approval.
-- Adds nothing and removes nothing: it replaces two functions. Tested by src/test/sync-operations.test.ts.
--
-- 1. Every sale and purchase failed with `column reference "key" is ambiguous`, because a variable shared a name with a column.
--    The first sale on any shop stopped its whole upload queue.
-- 2. The stock check also ran as if the shop had no records yet (an upsert fires the insert trigger first), so it demanded that each
--    product's quantity equal the sum of all its movements. A shop with older products that have no movements could never upload.
--    It now compares against the shop's real previous records, as its own description always said.
-- 3. Point 2 is what happened to stop recorded movements from being removed, so that rule is now stated directly: movements never
--    change, and only a recorded reset may remove them.

CREATE OR REPLACE FUNCTION public.validate_shopbook_stock_projection() RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE p jsonb; old_product jsonb; m jsonb; old_qty numeric; next_qty numeric; delta numeric; current_payload jsonb;
BEGIN
 -- An upsert on an existing row fires this for the proposed insert and again for the update. The update has the real previous records.
 IF TG_OP = 'INSERT' AND EXISTS (SELECT 1 FROM public.shopbook_shop_sync WHERE user_id = NEW.user_id) THEN RETURN NEW; END IF;
 current_payload := CASE WHEN TG_OP = 'INSERT' THEN '{}'::jsonb ELSE OLD.payload END;
 FOR p IN SELECT value FROM jsonb_array_elements(coalesce(NEW.payload->'products','[]'::jsonb)) LOOP
  IF jsonb_typeof(p->'qty') IS DISTINCT FROM 'number' OR jsonb_typeof(p->'buy') IS DISTINCT FROM 'number' OR jsonb_typeof(p->'sell') IS DISTINCT FROM 'number' OR (p->>'qty')::numeric < 0 OR (p->>'buy')::numeric < 0 OR (p->>'sell')::numeric < 0 THEN RAISE EXCEPTION 'Invalid stock or price'; END IF;
  old_product := NULL;
  SELECT value INTO old_product FROM jsonb_array_elements(coalesce(current_payload->'products','[]'::jsonb)) WHERE value->>'id'=p->>'id';
  old_qty := coalesce((old_product->>'qty')::numeric,0); next_qty := (p->>'qty')::numeric; delta := 0;
  FOR m IN SELECT new_m.value FROM jsonb_array_elements(coalesce(NEW.payload->'movements','[]'::jsonb)) AS new_m(value) WHERE new_m.value->>'productId'=p->>'id' AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(current_payload->'movements','[]'::jsonb)) AS old_m(value) WHERE old_m.value->>'id'=new_m.value->>'id') LOOP
   IF jsonb_typeof(m->'qty') IS DISTINCT FROM 'number' OR jsonb_typeof(m->'prev') IS DISTINCT FROM 'number' OR jsonb_typeof(m->'next') IS DISTINCT FROM 'number' OR abs((m->>'prev')::numeric+(m->>'qty')::numeric-(m->>'next')::numeric)>0.001 OR (m->>'next')::numeric<0 THEN RAISE EXCEPTION 'Invalid audited movement'; END IF;
   delta := delta+(m->>'qty')::numeric;
  END LOOP;
  -- A product the server hasn't seen may arrive with stock and no movements: that is how older shops' first upload looks.
  IF old_product IS NOT NULL AND abs(next_qty-old_qty-delta)>0.001 THEN RAISE EXCEPTION 'SYNC_CONFLICT: stock change must equal recorded movements for %',p->>'id'; END IF;
 END LOOP;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.apply_shopbook_operation(p_operation uuid, p_device uuid, p_business text, p_kind text, p_changes jsonb, p_seq jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
 owner_id uuid := auth.uid();
 previous public.shopbook_sync_operations;
 current_state jsonb;
 current_revision bigint;
 change jsonb;
 collection text;
 record_id text;
 current_record jsonb;
 records jsonb;
 next_record jsonb;
 seq_key text;
 seq_value jsonb;
 result jsonb;
 allowed text[] := ARRAY['products','categories','brands','units','attributes','locations','movements','transfers','audit','customers','sales','payments','returns','cash','employees','commissions','payrolls','payrollPayments','suppliers','purchases','purchaseReturns','expenses','expenseCategories','otherContacts','contactCategories','payrollDrafts','purchaseOrders','supplierInvoices'];
BEGIN
 IF owner_id IS NULL THEN RAISE EXCEPTION 'Sign-in required'; END IF;
 IF jsonb_typeof(p_changes) <> 'array' OR jsonb_typeof(p_seq) <> 'object' OR length(p_business) > 160 OR octet_length(p_changes::text) > 14000000 THEN RAISE EXCEPTION 'Invalid operation'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
 SELECT * INTO previous FROM public.shopbook_sync_operations WHERE user_id = owner_id AND operation_id = p_operation;
 IF FOUND THEN
   IF previous.request <> jsonb_build_object('changes', p_changes, 'seq', p_seq) OR previous.business_id <> p_business OR previous.device_id <> p_device THEN RAISE EXCEPTION 'Operation ID already used with another payload'; END IF;
   RETURN jsonb_build_object('revision', previous.revision, 'acknowledgedAt', previous.acknowledged_at, 'operationId', previous.operation_id);
 END IF;
 SELECT payload, revision INTO current_state, current_revision FROM public.shopbook_shop_sync WHERE user_id = owner_id FOR UPDATE;
 current_state := coalesce(current_state, '{}'::jsonb); current_revision := coalesce(current_revision, 0);
 FOR change IN SELECT value FROM jsonb_array_elements(p_changes) LOOP
   collection := change->>'collection'; record_id := change->>'id';
   IF NOT collection = ANY(allowed) OR record_id IS NULL THEN RAISE EXCEPTION 'Invalid record collection'; END IF;
   records := coalesce(current_state->collection, '[]'::jsonb);
   current_record := NULL;
   SELECT value INTO current_record FROM jsonb_array_elements(records) WHERE value->>'id' = record_id;
   current_record := coalesce(current_record, 'null'::jsonb);
   IF current_record <> coalesce(change->'before', 'null'::jsonb) THEN RAISE EXCEPTION 'SYNC_CONFLICT: % record % changed on another device; review required', collection, record_id; END IF;
   next_record := coalesce(change->'after', 'null'::jsonb);
   IF collection = 'movements' AND current_record <> 'null'::jsonb AND (next_record <> 'null'::jsonb OR coalesce((p_seq->>'__reset:movements')::bigint, 0) <= coalesce((current_state->'seq'->>'__reset:movements')::bigint, 0)) THEN RAISE EXCEPTION 'Movements can''t be changed'; END IF;
   IF next_record <> 'null'::jsonb THEN
     IF jsonb_typeof(next_record) <> 'object' OR next_record->>'id' IS DISTINCT FROM record_id THEN RAISE EXCEPTION 'Invalid record'; END IF;
     IF collection = 'products' AND ((next_record->>'qty')::numeric < 0 OR (next_record->>'buy')::numeric < 0 OR (next_record->>'sell')::numeric < 0) THEN RAISE EXCEPTION 'Invalid stock or price'; END IF;
     IF collection IN ('sales','purchases') THEN
       IF jsonb_typeof(next_record->'items') <> 'array' OR jsonb_typeof(next_record->'pay') <> 'object' OR (next_record->>'total')::numeric < 0 THEN RAISE EXCEPTION 'Invalid transaction'; END IF;
       IF EXISTS (SELECT 1 FROM jsonb_each_text(next_record->'pay') WHERE key NOT IN ('cash','mpesa','bank','credit') OR value::numeric < 0) THEN RAISE EXCEPTION 'Invalid payment split'; END IF;
       IF abs((SELECT coalesce(sum(value::numeric),0) FROM jsonb_each_text(next_record->'pay')) - (next_record->>'total')::numeric) > 0.01 THEN RAISE EXCEPTION 'Payment allocation does not equal total'; END IF;
       IF collection = 'sales' AND (next_record->'pay'->>'credit')::numeric > 0 AND coalesce(next_record->>'customerId','') = '' THEN RAISE EXCEPTION 'Credit requires a customer'; END IF;
       IF collection = 'purchases' AND (next_record->'pay'->>'credit')::numeric > 0 AND coalesce(next_record->>'supplierId','') = '' THEN RAISE EXCEPTION 'Credit requires a supplier'; END IF;
     END IF;
   END IF;
   SELECT coalesce(jsonb_agg(value), '[]'::jsonb) INTO records FROM jsonb_array_elements(records) WHERE value->>'id' <> record_id;
   IF next_record <> 'null'::jsonb THEN records := records || jsonb_build_array(next_record); END IF;
   current_state := jsonb_set(current_state, ARRAY[collection], records, true);
 END LOOP;
 FOR seq_key, seq_value IN SELECT * FROM jsonb_each(p_seq) LOOP
   current_state := jsonb_set(current_state, '{seq}', coalesce(current_state->'seq','{}'::jsonb) || jsonb_build_object(seq_key, greatest(coalesce((current_state->'seq'->>seq_key)::bigint,0), (seq_value::text)::bigint)), true);
 END LOOP;
 current_revision := current_revision + 1;
 INSERT INTO public.shopbook_shop_sync(user_id, revision, device_id, payload, updated_at) VALUES(owner_id,current_revision,p_device,current_state,now())
 ON CONFLICT(user_id) DO UPDATE SET revision=excluded.revision,device_id=excluded.device_id,payload=excluded.payload,updated_at=excluded.updated_at;
 INSERT INTO public.shopbook_sync_operations(user_id,operation_id,device_id,business_id,kind,request,revision)
 VALUES(owner_id,p_operation,p_device,p_business,p_kind,jsonb_build_object('changes',p_changes,'seq',p_seq),current_revision)
 RETURNING jsonb_build_object('revision',revision,'acknowledgedAt',acknowledged_at,'operationId',operation_id) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.apply_shopbook_operation(uuid,uuid,text,text,jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_shopbook_operation(uuid,uuid,text,text,jsonb,jsonb) TO authenticated, service_role;
