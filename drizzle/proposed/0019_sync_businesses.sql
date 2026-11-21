-- PROPOSED: not deployed. This folder is not in the migration journal, so nothing applies it. Move it to drizzle/migrations only after the owner approves it.
-- Lets an owner's devices sync their businesses (Stage 2, multi-business management). Generated from 0015 and src/lib/industry-config.ts;
-- tested by src/test/business-sync.test.ts and the migration rehearsal. Rollback: drizzle/proposed/rollback/0019_sync_businesses.down.sql.
--
-- Why: erp.ts keeps the owner's businesses in the `businesses` collection, but no migration allows it, so every upload holding a business
-- (creating one, editing one, the sample data) is refused with "Invalid record collection" and waits on the device. Records of every
-- other collection that carry a businessId already sync; only the business rows themselves were missing.
--
-- What changes (apply_shopbook_operation_for from 0015 is repeated exactly, with three changes):
-- 1. `businesses` joins the collections an owner's device may sync. Employees still can't: they record only through apply_member_operation (0013).
-- 2. Each business row is checked by shopbook_business_problem: an id of biz-main or 6-40 lower-case letters and digits; a name of 1-80
--    characters; a three-letter upper-case currency; active true, false or absent; a phone of 7-15 digits and an email of up to 120
--    characters when given. An industry, when given, must be one of the eight approved industries, and the business type (and every entry of
--    businessTypes) must be one of that industry's approved types: the 111 rows of business_type_catalogue (Trade's 10 added on 2026-11-20), the same list as the app.
--    Rows saved before industries existed may have no industry; their business type must still be an approved name.
-- 3. A business row can't be removed: it is archived (active false), so its records always have an owner.
-- 4. apply_member_operation (0013, the employee path) is repeated exactly with one added refusal: an employee's operation that carries a
--    business row is refused, so only the owner's own call can create or change a business, enforced here and not only by the app server.
-- Authorization is unchanged: only the owner's own call (auth.uid(), through apply_shopbook_operation) reaches this function, and it writes
-- only that owner's row of shopbook_shop_sync. The catalogue table has row security on and no policies, so no API caller can read or change it.
-- Backward compatible: nothing already stored changes. Uploads that were refused only because of this collection go through once it is live.
-- Must run after 0015 (it replaces 0015's function). Safe to run again after its rollback.

CREATE TABLE IF NOT EXISTS public.business_type_catalogue (
 industry_id text NOT NULL CHECK (industry_id IN ('trade', 'manufacturing', 'hospitality', 'services', 'property-construction', 'logistics', 'education', 'healthcare')),
 business_type text NOT NULL CHECK (length(business_type) BETWEEN 1 AND 80),
 PRIMARY KEY (industry_id, business_type)
);
ALTER TABLE public.business_type_catalogue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.business_type_catalogue FROM PUBLIC, anon, authenticated;
INSERT INTO public.business_type_catalogue (industry_id, business_type) VALUES
 ('trade', 'Retail Shop'),
 ('trade', 'Supermarket'),
 ('trade', 'Wholesale Business'),
 ('trade', 'Electronics Shop'),
 ('trade', 'Clothing & Fashion Shop'),
 ('trade', 'Grocery Store'),
 ('trade', 'Hardware Shop'),
 ('trade', 'Cosmetics & Beauty Shop'),
 ('trade', 'Furniture Shop'),
 ('trade', 'Pharmacy'),
 ('trade', 'Jewellery Shop'),
 ('trade', 'General Merchandise Store'),
 ('trade', 'Building Materials Shop'),
 ('trade', 'Automotive Parts Shop'),
 ('trade', 'Stationery & Bookshop'),
 ('trade', 'Agrovet'),
 ('trade', 'Butchery'),
 ('trade', 'Wines & Spirits'),
 ('trade', 'Mobile Phones & Accessories'),
 ('trade', 'Shoe Shop'),
 ('trade', 'Mitumba (Second-hand Clothes)'),
 ('trade', 'Gas / LPG Dealer'),
 ('trade', 'Cereals & Grains Shop'),
 ('trade', 'Mini-mart / Kiosk'),
 ('trade', 'General Trade'),
 ('manufacturing', 'Food & Beverage Manufacturing'),
 ('manufacturing', 'Textile & Garment Manufacturing'),
 ('manufacturing', 'Furniture Manufacturing'),
 ('manufacturing', 'Pharmaceutical Manufacturing'),
 ('manufacturing', 'Packaging Manufacturing'),
 ('manufacturing', 'Printing & Publishing'),
 ('manufacturing', 'Plastic & Rubber Manufacturing'),
 ('manufacturing', 'Metal Fabrication'),
 ('manufacturing', 'Chemical Manufacturing'),
 ('manufacturing', 'Electronics Manufacturing'),
 ('manufacturing', 'Building Materials Manufacturing'),
 ('manufacturing', 'General Manufacturing'),
 ('hospitality', 'Hotel'),
 ('hospitality', 'Resort'),
 ('hospitality', 'Lodge'),
 ('hospitality', 'Guesthouse'),
 ('hospitality', 'Serviced Apartments'),
 ('hospitality', 'Boutique Hotel'),
 ('hospitality', 'Restaurant'),
 ('hospitality', 'Café'),
 ('hospitality', 'Catering Business'),
 ('hospitality', 'Bar & Lounge'),
 ('hospitality', 'Fast-Food Business'),
 ('hospitality', 'Event Venue'),
 ('hospitality', 'Banquet & Conference Facility'),
 ('services', 'Laundry & Dry Cleaning'),
 ('services', 'Salon & Beauty'),
 ('services', 'Barber Shop'),
 ('services', 'Spa & Wellness'),
 ('services', 'Repair & Maintenance Services'),
 ('services', 'Cleaning Services'),
 ('services', 'Equipment Rental'),
 ('services', 'Vehicle Rental'),
 ('services', 'Professional Services'),
 ('services', 'Photography & Media Services'),
 ('services', 'Printing Services'),
 ('services', 'Consultancy Services'),
 ('property-construction', 'Real Estate Agency'),
 ('property-construction', 'Property Brokerage'),
 ('property-construction', 'Residential Property Sales'),
 ('property-construction', 'Commercial Property Sales'),
 ('property-construction', 'Land Sales'),
 ('property-construction', 'Residential Property Management'),
 ('property-construction', 'Commercial Property Management'),
 ('property-construction', 'Apartment & Estate Management'),
 ('property-construction', 'Residential Rentals'),
 ('property-construction', 'Commercial Rentals'),
 ('property-construction', 'Short-Term Rentals'),
 ('property-construction', 'Property Development'),
 ('property-construction', 'Building Contractor'),
 ('property-construction', 'Civil Construction'),
 ('property-construction', 'Road Construction'),
 ('property-construction', 'Infrastructure Construction'),
 ('property-construction', 'Renovation & Refurbishment'),
 ('property-construction', 'Civil Engineering'),
 ('property-construction', 'Mechanical Engineering'),
 ('property-construction', 'Electrical Engineering'),
 ('property-construction', 'Engineering Consultancy'),
 ('property-construction', 'Facilities Engineering'),
 ('logistics', 'Transport Company'),
 ('logistics', 'Logistics Company'),
 ('logistics', 'Distribution Business'),
 ('logistics', 'Courier & Delivery Services'),
 ('logistics', 'Freight Forwarding'),
 ('logistics', 'Cargo Handling'),
 ('logistics', 'Fleet Management Business'),
 ('logistics', 'Warehousing & Storage'),
 ('logistics', 'Moving & Relocation Services'),
 ('education', 'Primary School'),
 ('education', 'Secondary School'),
 ('education', 'College'),
 ('education', 'University'),
 ('education', 'Technical & Vocational Institution'),
 ('education', 'Training Centre'),
 ('education', 'Early Childhood Education Centre'),
 ('education', 'Online Learning Institution'),
 ('education', 'Professional Training Institution'),
 ('healthcare', 'Medical Clinic'),
 ('healthcare', 'Hospital'),
 ('healthcare', 'Dental Clinic'),
 ('healthcare', 'Medical Laboratory'),
 ('healthcare', 'Diagnostic Centre'),
 ('healthcare', 'Specialist Medical Centre'),
 ('healthcare', 'Physiotherapy Centre'),
 ('healthcare', 'Medical Imaging Centre'),
 ('healthcare', 'Outpatient Centre')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.shopbook_business_problem(r jsonb) RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
 industry text := nullif(r->>'industryFamilyId', '');
 kind text := nullif(r->>'businessType', '');
 entry jsonb;
BEGIN
 IF jsonb_typeof(r) <> 'object' THEN RETURN 'not a record'; END IF;
 IF coalesce(r->>'id', '') !~ '^(biz-main|[a-z0-9]{6,40})$' THEN RETURN 'id'; END IF;
 IF jsonb_typeof(r->'name') IS DISTINCT FROM 'string' OR length(trim(r->>'name')) NOT BETWEEN 1 AND 80 THEN RETURN 'name'; END IF;
 IF coalesce(r->>'currency', '') !~ '^[A-Z]{3}$' THEN RETURN 'currency'; END IF;
 IF r ? 'active' AND jsonb_typeof(r->'active') NOT IN ('boolean', 'null') THEN RETURN 'active'; END IF;
 IF nullif(r->>'phone', '') IS NOT NULL AND (length(regexp_replace(r->>'phone', '[^0-9]', '', 'g')) NOT BETWEEN 7 AND 15 OR length(r->>'phone') > 24) THEN RETURN 'phone'; END IF;
 IF nullif(r->>'email', '') IS NOT NULL AND (length(r->>'email') > 120 OR r->>'email' !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$') THEN RETURN 'email'; END IF;
 IF industry IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.business_type_catalogue WHERE industry_id = industry) THEN RETURN 'industry'; END IF;
 IF kind IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.business_type_catalogue WHERE business_type = kind AND (industry IS NULL OR industry_id = industry)) THEN RETURN 'business type is not part of the industry'; END IF;
 IF r ? 'businessTypes' AND jsonb_typeof(r->'businessTypes') NOT IN ('array', 'null') THEN RETURN 'businessTypes'; END IF;
 IF jsonb_typeof(r->'businessTypes') = 'array' THEN
   FOR entry IN SELECT value FROM jsonb_array_elements(r->'businessTypes') LOOP
     IF jsonb_typeof(entry) <> 'string' OR NOT EXISTS (SELECT 1 FROM public.business_type_catalogue WHERE business_type = entry #>> '{}' AND (industry IS NULL OR industry_id = industry)) THEN RETURN 'business type is not part of the industry'; END IF;
   END LOOP;
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.shopbook_business_problem(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.shopbook_business_problem(jsonb) TO service_role;

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
 problem text;
 allowed text[] := ARRAY['products','categories','brands','units','attributes','locations','movements','transfers','audit','customers','sales','payments','returns','cash','employees','commissions','payrolls','payrollPayments','suppliers','purchases','purchaseReturns','expenses','expenseCategories','otherContacts','contactCategories','payrollDrafts','purchaseOrders','supplierInvoices','moneyAccounts','businesses'];
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
   IF collection = 'businesses' AND current_record <> 'null'::jsonb AND next_record = 'null'::jsonb THEN RAISE EXCEPTION 'Invalid business: a business is archived (active false), never deleted'; END IF;
   IF collection = 'movements' AND current_record <> 'null'::jsonb AND (next_record <> 'null'::jsonb OR coalesce((p_seq->>'__reset:movements')::bigint, 0) <= coalesce((current_state->'seq'->>'__reset:movements')::bigint, 0)) THEN RAISE EXCEPTION 'Movements can''t be changed'; END IF;
   IF next_record <> 'null'::jsonb THEN
     IF jsonb_typeof(next_record) <> 'object' OR next_record->>'id' IS DISTINCT FROM record_id THEN RAISE EXCEPTION 'Invalid record'; END IF;
     IF collection = 'businesses' THEN
       problem := public.shopbook_business_problem(next_record);
       IF problem IS NOT NULL THEN RAISE EXCEPTION 'Invalid business: %', problem; END IF;
     END IF;
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

CREATE OR REPLACE FUNCTION public.apply_member_operation(p_member uuid, p_operation uuid, p_device uuid, p_kind text, p_changes jsonb, p_seq jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE owner_id uuid; bound text;
BEGIN
 SELECT a.owner_user_id INTO owner_id FROM owner_members m JOIN owner_accounts a ON a.id = m.owner_account_id WHERE m.id = p_member AND m.status = 'active';
 IF owner_id IS NULL THEN RAISE EXCEPTION 'Not allowed'; END IF;
 SELECT business_id INTO bound FROM shopbook_sync_business WHERE user_id = owner_id;
 IF bound IS NULL THEN RAISE EXCEPTION 'The owner''s records are not on the server yet'; END IF;
 -- Only the owner creates or changes a business: an employee's operation may never carry a business row (0019).
 IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_changes) c WHERE c->>'collection' = 'businesses') THEN RAISE EXCEPTION 'Not allowed: only the owner can change a business'; END IF;
 RETURN public.apply_shopbook_operation_for(owner_id, p_operation, p_device, bound, p_kind, p_changes, p_seq);
END $$;
REVOKE ALL ON FUNCTION public.apply_member_operation(uuid,uuid,uuid,text,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_member_operation(uuid,uuid,uuid,text,jsonb,jsonb) TO service_role;
