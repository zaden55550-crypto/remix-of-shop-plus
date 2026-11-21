-- PROPOSED: not deployed. This folder is not in the migration journal, so nothing applies it. Move it to drizzle/migrations only after approval.
-- Payment methods the owner names (EVC, Airtel Money, Card…) and their saved settings for Cash, M-Pesa and Bank. The app allows up to 30 in use; the server sets no count. Changes no records.
-- Tested by src/test/money-accounts.test.ts and the migration rehearsal.
--
-- apply_shopbook_operation_for (0013) is repeated exactly, with three changes:
-- 1. moneyAccounts joins the collections a device may sync (the account list itself: id, name, active).
-- 2. A sale's or purchase's pay split may hold a named account's id ("acct-" then letters and digits) as well as cash, mpesa, bank and credit.
--    Every other rule is unchanged: no negative amount, and the parts must still add up to the total.
-- 3. A money account record needs an acct- id, or one of the fixed ids cash, mpesa, bank (the business's saved name, order,
--    category or disabled state for a built-in method; amended 2026-11-09 for configurable payment methods), and a name of 1 to 40 characters.
-- Until this is applied, a device that records a sale or purchase paid into a named account gets "Invalid payment split" when it syncs, and the
-- operation stays pending on the device (nothing is lost; it goes through once this is live). Payments, returns and expenses already pass.
-- Must run after 0013 (it replaces 0013's function) and may run before or after 0014.

CREATE OR REPLACE FUNCTION public.apply_shopbook_operation_for(owner_id uuid, p_operation uuid, p_device uuid, p_business text, p_kind text, p_changes jsonb, p_seq jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
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
 allowed text[] := ARRAY['products','categories','brands','units','attributes','locations','movements','transfers','audit','customers','sales','payments','returns','cash','employees','commissions','payrolls','payrollPayments','suppliers','purchases','purchaseReturns','expenses','expenseCategories','otherContacts','contactCategories','payrollDrafts','purchaseOrders','supplierInvoices','moneyAccounts'];
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
     IF collection = 'moneyAccounts' AND (record_id !~ '^(cash|mpesa|bank|acct-[a-z0-9]{1,40})$' OR length(trim(coalesce(next_record->>'name',''))) NOT BETWEEN 1 AND 40) THEN RAISE EXCEPTION 'Invalid money account'; END IF;
     IF collection = 'products' AND ((next_record->>'qty')::numeric < 0 OR (next_record->>'buy')::numeric < 0 OR (next_record->>'sell')::numeric < 0) THEN RAISE EXCEPTION 'Invalid stock or price'; END IF;
     IF collection IN ('sales','purchases') THEN
       IF jsonb_typeof(next_record->'items') <> 'array' OR jsonb_typeof(next_record->'pay') <> 'object' OR (next_record->>'total')::numeric < 0 THEN RAISE EXCEPTION 'Invalid transaction'; END IF;
       IF EXISTS (SELECT 1 FROM jsonb_each_text(next_record->'pay') WHERE NOT (key IN ('cash','mpesa','bank','credit') OR key ~ '^acct-[a-z0-9]{1,40}$') OR value::numeric < 0) THEN RAISE EXCEPTION 'Invalid payment split'; END IF;
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
REVOKE ALL ON FUNCTION public.apply_shopbook_operation_for(uuid,uuid,uuid,text,text,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_shopbook_operation_for(uuid,uuid,uuid,text,text,jsonb,jsonb) TO service_role;
