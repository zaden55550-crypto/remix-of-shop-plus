-- Integration assertions against the actual application database. All test writes roll back.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '00000000-0000-4000-8000-00000000aa01';
DO $$
DECLARE
  result jsonb;
  repeated jsonb;
  changes jsonb := '[{"collection":"products","id":"integration-product","before":null,"after":{"id":"integration-product","name":"Integration product","buy":10,"sell":20,"qty":10,"createdAt":1}},{"collection":"movements","id":"integration-movement","before":null,"after":{"id":"integration-movement","productId":"integration-product","qty":10,"prev":0,"next":10,"type":"OPENING","at":1,"user":"Integration"}}]'::jsonb;
  n integer;
BEGIN
  result := public.apply_shopbook_operation('00000000-0000-4000-8000-00000000bb01','00000000-0000-4000-8000-00000000cc01','integration-business','PRODUCT CREATED',changes,'{"SKU":1}');
  repeated := public.apply_shopbook_operation('00000000-0000-4000-8000-00000000bb01','00000000-0000-4000-8000-00000000cc01','integration-business','PRODUCT CREATED',changes,'{"SKU":1}');
  IF result <> repeated THEN RAISE EXCEPTION 'Retry returned a different acknowledgement'; END IF;
  SELECT count(*) INTO n FROM public.shopbook_sync_operations WHERE user_id='00000000-0000-4000-8000-00000000aa01';
  IF n <> 1 THEN RAISE EXCEPTION 'Retry duplicated an operation'; END IF;
  BEGIN
    PERFORM public.apply_shopbook_operation('00000000-0000-4000-8000-00000000bb02','00000000-0000-4000-8000-00000000cc02','integration-business','STOCK CHANGE',changes,'{}');
    RAISE EXCEPTION 'Conflicting stale product update was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%SYNC_CONFLICT%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.apply_shopbook_operation('00000000-0000-4000-8000-00000000bb01','00000000-0000-4000-8000-00000000cc01','integration-business','PRODUCT CREATED','[]','{}');
    RAISE EXCEPTION 'Reused ID with changed payload was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%already used%' THEN RAISE; END IF;
  END;
  RAISE NOTICE 'PASS: server persistence, stable acknowledgement, no duplicate, stale conflict, immutable operation ID';
END $$;
ROLLBACK;