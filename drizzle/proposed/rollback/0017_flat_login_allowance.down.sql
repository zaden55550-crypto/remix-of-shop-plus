-- PROPOSED ROLLBACK: never run this without the owner's approval. Copies the earlier definitions (0011) exactly.
-- Returns to logins worked out from locations (1 owner + managers + employees per shop/storage). No records change: logins
-- already created stay; an account the earlier rules count as over simply can't add more until it is within them.

ALTER TABLE public.subscription_plans ALTER COLUMN max_users DROP NOT NULL;
UPDATE public.subscription_plans SET max_users = 2, max_managers = 0 WHERE id = 'basic';
UPDATE public.subscription_plans SET max_users = NULL, max_managers = 1 WHERE id = 'growth';
UPDATE public.subscription_plans SET max_users = NULL, max_managers = 3 WHERE id = 'business';

CREATE OR REPLACE FUNCTION public.account_usage(p_account uuid) RETURNS TABLE (plan_id text, status text, usable boolean,
 max_locations integer, active_locations integer, available_locations integer, excess_locations integer, shops integer, stores integer, warehouses integer,
 max_managers integer, active_managers integer, available_managers integer, excess_managers integer,
 employee_slots integer, active_employees integer, available_employees integer, excess_employees integer,
 max_users integer, active_users integer, available_users integer, excess_users integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE sub owner_subscriptions; pl subscription_plans; sh integer; st integer; wh integer; mgr integer; emp integer; seats integer; slots integer; total integer; ok boolean;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' AND NOT has_permission(p_account, 'locations.manage') AND NOT is_account_owner(p_account) THEN RAISE EXCEPTION 'Not allowed'; END IF;
 SELECT * INTO sub FROM owner_subscriptions s WHERE s.owner_account_id = p_account;
 IF NOT FOUND THEN RAISE EXCEPTION 'No subscription'; END IF;
 SELECT * INTO pl FROM subscription_plans p WHERE p.id = sub.plan_id;
 SELECT count(*) FILTER (WHERE l.kind = 'shop'), count(*) FILTER (WHERE l.kind = 'store'), count(*) FILTER (WHERE l.kind = 'warehouse')
  INTO sh, st, wh FROM locations l WHERE l.owner_account_id = p_account AND l.status = 'active';
 -- Each login is one row, so a person with several locations is counted once.
 SELECT count(*), count(*) FILTER (WHERE is_manager_role(m.role)), count(*) FILTER (WHERE m.role <> 'owner' AND NOT is_manager_role(m.role))
  INTO seats, mgr, emp FROM owner_members m WHERE m.owner_account_id = p_account AND holds_seat(m.status);
 slots := sh * pl.employees_per_shop + (st + wh) * pl.employees_per_storage;
 SELECT count(*) INTO emp FROM member_locations ml JOIN owner_members m ON m.id = ml.member_id JOIN locations l ON l.id = ml.location_id
  WHERE m.owner_account_id = p_account AND holds_seat(m.status) AND ((m.role = 'shopkeeper' AND l.kind = 'shop') OR (m.role = 'warehouse_staff' AND l.kind <> 'shop'));
 IF pl.id = 'basic' THEN slots := 1; total := 2; ELSE total := 1 + pl.max_managers + slots; END IF;
 ok := CASE sub.status WHEN 'active' THEN true
  WHEN 'trial' THEN coalesce(sub.trial_ends_at > now(), false)
  WHEN 'past_due' THEN coalesce(sub.grace_until > now(), false)
  ELSE false END;
 RETURN QUERY SELECT pl.id, sub.status, ok,
  pl.max_locations, sh + st + wh, greatest(pl.max_locations - sh - st - wh, 0), greatest(sh + st + wh - pl.max_locations, 0), sh, st, wh,
  pl.max_managers, mgr, greatest(pl.max_managers - mgr, 0), greatest(mgr - pl.max_managers, 0),
  slots, emp, greatest(slots - emp, 0), greatest(emp - slots, 0),
  total, seats, greatest(total - seats, 0), greatest(seats - total, 0);
END $$;

CREATE OR REPLACE FUNCTION public.location_allowances(p_account uuid) RETURNS TABLE (location_id uuid, allowance integer, employees integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT l.id,
  CASE l.kind WHEN 'shop' THEN pl.employees_per_shop ELSE pl.employees_per_storage END,
  (SELECT count(*)::integer FROM member_locations ml JOIN owner_members m ON m.id = ml.member_id WHERE ml.location_id = l.id AND holds_seat(m.status)
    AND ((l.kind = 'shop' AND m.role = 'shopkeeper') OR (l.kind <> 'shop' AND m.role = 'warehouse_staff')))
 FROM locations l JOIN owner_subscriptions s ON s.owner_account_id = l.owner_account_id JOIN subscription_plans pl ON pl.id = s.plan_id
 WHERE l.owner_account_id = p_account AND l.status = 'active'
$$;

CREATE OR REPLACE FUNCTION public.check_login_allowance(p_account uuid, p_member uuid, p_role text, p_locations uuid[]) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE u record; pl subscription_plans; old owner_members; seated boolean; was_manager boolean; was_staff boolean; others integer; full_place text;
BEGIN
 SELECT * INTO u FROM account_usage(p_account);
 SELECT * INTO pl FROM subscription_plans WHERE id = u.plan_id;
 SELECT * INTO old FROM owner_members WHERE id = p_member;
 seated := FOUND AND holds_seat(old.status);
 was_manager := seated AND is_manager_role(old.role);
 was_staff := seated AND old.role IN ('shopkeeper', 'warehouse_staff');
 IF p_role NOT IN ('admin', 'manager', 'shopkeeper', 'warehouse_staff') THEN RAISE EXCEPTION 'ROLE_LIMIT: choose Manager, Shopkeeper or Storekeeper'; END IF;
 IF is_manager_role(p_role) THEN
  IF NOT was_manager THEN
   SELECT count(*) INTO others FROM owner_members m WHERE m.owner_account_id = p_account AND holds_seat(m.status) AND is_manager_role(m.role);
   IF others >= u.max_managers THEN RAISE EXCEPTION 'MANAGER_LIMIT: your plan allows % manager accounts and has % in use', u.max_managers, others; END IF;
  END IF;
  IF NOT seated AND (u.active_users > u.max_users OR (pl.id = 'growth' AND u.active_users >= u.max_users)) THEN RAISE EXCEPTION 'USER_LIMIT: your plan has no remaining login positions'; END IF;
  RETURN;
 END IF;
 IF p_role = 'warehouse_staff' AND pl.id = 'basic' THEN RAISE EXCEPTION 'LOCATION_USER_LIMIT: Basic has no Storekeeper positions'; END IF;
 IF coalesce(cardinality(p_locations), 0) = 0 THEN RAISE EXCEPTION 'LOCATION_REQUIRED: assign this employee to at least one location'; END IF;
 SELECT l.name INTO full_place FROM unnest(coalesce(p_locations, '{}')) x JOIN locations l ON l.id = x
 WHERE l.owner_account_id = p_account AND l.status = 'active' AND ((p_role = 'shopkeeper' AND l.kind <> 'shop') OR (p_role = 'warehouse_staff' AND l.kind = 'shop')) LIMIT 1;
 IF FOUND THEN RAISE EXCEPTION 'LOCATION_ROLE: % cannot be assigned this role', full_place; END IF;
 IF NOT seated AND u.active_users >= u.max_users THEN RAISE EXCEPTION 'USER_LIMIT: your plan has no remaining login positions'; END IF;
 SELECT l.name INTO full_place FROM unnest(coalesce(p_locations, '{}')) x JOIN locations l ON l.id = x
 WHERE l.owner_account_id = p_account AND l.status = 'active' AND
  (SELECT count(*) FROM member_locations ml JOIN owner_members m ON m.id = ml.member_id WHERE ml.location_id = l.id AND holds_seat(m.status) AND m.role = p_role AND m.id IS DISTINCT FROM p_member)
  >= CASE WHEN l.kind = 'shop' THEN pl.employees_per_shop ELSE pl.employees_per_storage END LIMIT 1;
 IF FOUND THEN RAISE EXCEPTION 'LOCATION_USER_LIMIT: % has all its role positions', full_place; END IF;
 IF NOT was_staff AND u.active_employees >= u.employee_slots THEN RAISE EXCEPTION 'USER_LIMIT: no operational staff positions remain'; END IF;
END $$;
