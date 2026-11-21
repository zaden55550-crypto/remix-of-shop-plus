-- PROPOSED: not deployed. This folder is not in the migration journal, so nothing applies it. Move it to drizzle/migrations only after approval.
-- Logins per plan (owner's rule, 2026-11-20): Basic 2, Growth 12, Business 24, the owner included, whatever the number or type of
-- locations, in three fixed parts: 1 owner, up to 0 / 1 / 3 managers or admins, and up to 1 / 10 / 20 staff. Unused manager places
-- never become staff places. Staff are placed freely, all at one shop or shared between shops and warehouses, across every business
-- of the account; no location has its own staff limit. Basic has one employee and no Warehouse.
-- Every location still uses one site. A person counts once however many locations they have.
-- Replaces 0011's calculation and validator; existing records are retained when a plan change makes them over allowance.
-- Tested by src/test/entitlements.test.ts and the migration rehearsal. Reversed by rollback/0017_flat_login_allowance.down.sql.

-- ---------- Plans ----------
UPDATE public.subscription_plans SET max_users = 2, max_managers = 0, employees_per_shop = 1, employees_per_storage = 0, monthly_usd = 11 WHERE id = 'basic';
UPDATE public.subscription_plans SET max_users = 12, max_managers = 1, employees_per_shop = 2, employees_per_storage = 1, monthly_usd = 22 WHERE id = 'growth';
UPDATE public.subscription_plans SET max_users = 24, max_managers = 3, employees_per_shop = 2, employees_per_storage = 1, monthly_usd = 50 WHERE id = 'business';
ALTER TABLE public.subscription_plans ALTER COLUMN max_users DROP NOT NULL;

-- ---------- The one calculation ----------
CREATE OR REPLACE FUNCTION public.account_usage(p_account uuid) RETURNS TABLE (plan_id text, status text, usable boolean,
 max_locations integer, active_locations integer, available_locations integer, excess_locations integer, shops integer, stores integer, warehouses integer,
 max_managers integer, active_managers integer, available_managers integer, excess_managers integer,
 employee_slots integer, active_employees integer, available_employees integer, excess_employees integer,
 max_users integer, active_users integer, available_users integer, excess_users integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE sub owner_subscriptions; pl subscription_plans; sh integer; st integer; wh integer; mgr integer; emp integer; seats integer; staff integer; total integer; free integer; ok boolean;
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
 -- employees_per_shop / employees_per_storage no longer limit anyone; the plan's max_users is the whole pool.
 total := coalesce(pl.max_users, 2);
 staff := total - 1 - pl.max_managers;
 free := greatest(total - seats, 0);
 ok := CASE sub.status WHEN 'active' THEN true
  WHEN 'trial' THEN coalesce(sub.trial_ends_at > now(), false)
  WHEN 'past_due' THEN coalesce(sub.grace_until > now(), false)
  ELSE false END;
 RETURN QUERY SELECT pl.id, sub.status, ok,
  pl.max_locations, sh + st + wh, greatest(pl.max_locations - sh - st - wh, 0), greatest(sh + st + wh - pl.max_locations, 0), sh, st, wh,
  pl.max_managers, mgr, greatest(pl.max_managers - mgr, 0), greatest(mgr - pl.max_managers, 0),
  staff, emp, free, greatest(mgr + emp - staff, 0),
  total, seats, free, greatest(seats - total, 0);
END $$;

/** Any location may hold the plan's whole staff allowance: no location has its own limit. */
CREATE OR REPLACE FUNCTION public.location_allowances(p_account uuid) RETURNS TABLE (location_id uuid, allowance integer, employees integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT l.id,
  coalesce(pl.max_users, 2) - 1 - pl.max_managers,
  (SELECT count(*)::integer FROM member_locations ml JOIN owner_members m ON m.id = ml.member_id WHERE ml.location_id = l.id AND holds_seat(m.status)
    AND ((l.kind = 'shop' AND m.role = 'shopkeeper') OR (l.kind <> 'shop' AND m.role = 'warehouse_staff')))
 FROM locations l JOIN owner_subscriptions s ON s.owner_account_id = l.owner_account_id JOIN subscription_plans pl ON pl.id = s.plan_id
 WHERE l.owner_account_id = p_account AND l.status = 'active'
$$;

/** Refuses a login the plan has no room for. A place the person already holds is never counted against them, so a plan change
 *  that leaves an account over its total doesn't stop the owner editing the people already there. */
CREATE OR REPLACE FUNCTION public.check_login_allowance(p_account uuid, p_member uuid, p_role text, p_locations uuid[]) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE u record; pl subscription_plans; old owner_members; seated boolean; was_manager boolean; was_staff boolean; wanted integer; full_place text;
BEGIN
 SELECT * INTO u FROM account_usage(p_account);
 SELECT * INTO pl FROM subscription_plans WHERE id = u.plan_id;
 SELECT * INTO old FROM owner_members WHERE id = p_member;
 seated := FOUND AND holds_seat(old.status);
 was_manager := seated AND is_manager_role(old.role);
 was_staff := seated AND old.role IN ('shopkeeper', 'warehouse_staff');
 IF p_role NOT IN ('admin', 'manager', 'shopkeeper', 'warehouse_staff') THEN RAISE EXCEPTION 'ROLE_LIMIT: choose Manager, Shopkeeper or Storekeeper'; END IF;
 IF is_manager_role(p_role) THEN
  IF NOT was_manager AND u.active_managers >= u.max_managers THEN
   RAISE EXCEPTION 'MANAGER_LIMIT: your plan allows % manager accounts and has % in use', u.max_managers, u.active_managers;
  END IF;
  IF NOT seated AND u.active_users >= u.max_users THEN
   RAISE EXCEPTION 'USER_LIMIT: your plan allows % active login accounts and has no remaining positions', u.max_users;
  END IF;
  RETURN;
 END IF;
 IF p_role = 'warehouse_staff' AND pl.id = 'basic' THEN RAISE EXCEPTION 'LOCATION_USER_LIMIT: Basic has no Storekeeper positions'; END IF;
 IF coalesce(cardinality(p_locations), 0) = 0 THEN RAISE EXCEPTION 'LOCATION_REQUIRED: assign this employee to at least one location'; END IF;
 SELECT l.name INTO full_place
 FROM unnest(coalesce(p_locations, '{}')) x JOIN locations l ON l.id = x
 WHERE l.owner_account_id = p_account AND l.status = 'active'
   AND ((p_role = 'shopkeeper' AND l.kind <> 'shop') OR (p_role = 'warehouse_staff' AND l.kind = 'shop'))
 LIMIT 1;
 IF FOUND THEN RAISE EXCEPTION 'LOCATION_ROLE: % cannot be assigned this role', full_place; END IF;
 IF NOT seated AND u.active_users >= u.max_users THEN
  RAISE EXCEPTION 'USER_LIMIT: your plan allows % active login accounts and has no remaining positions', u.max_users;
 END IF;
 -- Staff have their own part of the total: manager places left empty never become staff places.
 IF NOT was_staff AND u.active_employees >= u.employee_slots THEN
  RAISE EXCEPTION 'USER_LIMIT: your plan allows % staff accounts and all are in use', u.employee_slots;
 END IF;
END $$;

-- Basic cannot create a Store. Existing legacy storage rows remain untouched and can still be archived/viewed.
CREATE OR REPLACE FUNCTION public.enforce_basic_shop_only() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pid text;
BEGIN
 IF TG_OP = 'UPDATE' AND NEW.kind = OLD.kind THEN RETURN NEW; END IF;
 SELECT s.plan_id INTO pid FROM owner_subscriptions s WHERE s.owner_account_id = NEW.owner_account_id;
 IF pid = 'basic' AND NEW.kind <> 'shop' THEN RAISE EXCEPTION 'LOCATION_TYPE_LIMIT: Basic allows one Shop and no Warehouse'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS basic_shop_only ON public.locations;
CREATE TRIGGER basic_shop_only BEFORE INSERT OR UPDATE OF kind ON public.locations FOR EACH ROW EXECUTE FUNCTION public.enforce_basic_shop_only();

REVOKE ALL ON FUNCTION public.account_usage(uuid), public.location_allowances(uuid), public.check_login_allowance(uuid, uuid, text, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_usage(uuid) TO authenticated, service_role;
