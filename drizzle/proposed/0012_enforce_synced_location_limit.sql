-- PROPOSED: not deployed. This folder is not in the migration journal, so nothing applies it. Move it to drizzle/migrations only after approval.
-- The location list lives in the synced ERP records too, so a changed client could otherwise push more than the plan allows.
--
-- A business's first upload is always kept whole, however many locations it holds: its records must never be lost. Anything past the
-- allowance is flagged, on the server, from the shop's own records. After that no location may become active while the account is over,
-- whether it is new, brought back from archive, or swapped in for another so the count stays the same. All other work keeps syncing.
-- What a flagged location can't do is earn anything: logins and the server's location list go through create_location, which has its own limit.

/** The active locations in a fixed order: the built-in main location first (it is only stored once edited), then oldest first. Later ones are the ones flagged. */
CREATE FUNCTION public.active_erp_location_ids(p_payload jsonb) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE WHEN EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(p_payload->'locations', '[]'::jsonb)) x WHERE x->>'id' = 'loc-main' AND x->>'active' = 'false') THEN ARRAY[]::text[] ELSE ARRAY['loc-main'] END
  || coalesce((SELECT array_agg(x->>'id' ORDER BY CASE WHEN jsonb_typeof(x->'createdAt') = 'number' THEN (x->>'createdAt')::numeric ELSE 0 END, x->>'id') FROM jsonb_array_elements(coalesce(p_payload->'locations', '[]'::jsonb)) x WHERE x->>'id' <> 'loc-main' AND coalesce(x->>'active', 'true') <> 'false'), ARRAY[]::text[])
$$;

/** The plan's limit for this login. An owner with no account yet is on the trial's allowance. */
CREATE FUNCTION public.synced_location_allowance(p_user uuid) RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE allowed integer;
BEGIN
 SELECT p.max_locations INTO allowed FROM owner_accounts a JOIN owner_subscriptions s ON s.owner_account_id = a.id JOIN subscription_plans p ON p.id = s.plan_id WHERE a.owner_user_id = p_user;
 IF allowed IS NULL THEN SELECT max(p.max_locations) INTO allowed FROM subscription_plans p; END IF;
 RETURN allowed;
END $$;

CREATE FUNCTION public.enforce_synced_location_limit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE allowed integer := synced_location_allowance(NEW.user_id); now_ids text[] := active_erp_location_ids(NEW.payload); stored jsonb; acc uuid;
BEGIN
 -- Read the stored row rather than using OLD: the sync's upsert fires this as an insert first, even when the row exists.
 SELECT r.payload INTO stored FROM shopbook_shop_sync r WHERE r.user_id = NEW.user_id;
 IF NOT FOUND THEN
  IF cardinality(now_ids) > allowed THEN
   SELECT a.id INTO acc FROM owner_accounts a WHERE a.owner_user_id = NEW.user_id;
   IF acc IS NOT NULL THEN INSERT INTO audit_logs (owner_account_id, user_id, action, after_value) VALUES (acc, NEW.user_id, 'LOCATIONS OVER PLAN', jsonb_build_object('allowed', allowed, 'active', cardinality(now_ids), 'flagged', to_jsonb(now_ids[allowed + 1:]))); END IF;
  END IF;
  RETURN NEW;
 END IF;
 IF NOT EXISTS (SELECT 1 FROM unnest(now_ids) x WHERE NOT x = ANY(active_erp_location_ids(stored))) THEN RETURN NEW; END IF;
 IF cardinality(now_ids) > allowed THEN RAISE EXCEPTION 'LOCATION_LIMIT: your plan allows % active locations and this would make %. Upgrade or archive a location to add another', allowed, cardinality(now_ids); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER shopbook_shop_sync_location_limit BEFORE INSERT OR UPDATE ON public.shopbook_shop_sync FOR EACH ROW EXECUTE FUNCTION public.enforce_synced_location_limit();

/** Which of the caller's locations are past the allowance, worked out fresh, so an upgrade or an archive clears them at once and no client can edit the answer. */
CREATE FUNCTION public.synced_location_status() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); allowed integer; ids text[];
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign-in required'; END IF;
 allowed := synced_location_allowance(uid);
 SELECT active_erp_location_ids(r.payload) INTO ids FROM shopbook_shop_sync r WHERE r.user_id = uid;
 ids := coalesce(ids, ARRAY[]::text[]);
 RETURN jsonb_build_object('allowed', allowed, 'active', cardinality(ids), 'over', greatest(cardinality(ids) - allowed, 0), 'flagged', coalesce(to_jsonb(ids[allowed + 1:]), '[]'::jsonb));
END $$;

-- The first-upload rule depends on the row staying: without this a changed client could delete its records and call its next upload the first.
REVOKE DELETE ON public.shopbook_shop_sync FROM authenticated, anon;
REVOKE ALL ON FUNCTION public.enforce_synced_location_limit(), public.synced_location_allowance(uuid), public.synced_location_status() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.synced_location_status() TO authenticated;
