-- PROPOSED: not deployed. This folder is not in the migration journal, so nothing applies it. Move it to drizzle/migrations only after approval.
-- Final subscription rules. Logins are no longer one fixed number: a plan sets how many managers it authorises and how many
-- employee logins each type of location carries, and the total is worked out from the locations the owner actually has.
--   Total = 1 owner + authorised managers + (employees per shop x shops) + (employees per store or warehouse x stores and warehouses)
-- Nothing is deleted or suspended here. An account left over a limit keeps everyone and simply can't add more.

-- ---------- Plans ----------
ALTER TABLE public.subscription_plans
 ADD COLUMN max_managers integer NOT NULL DEFAULT 0 CHECK (max_managers >= 0),
 ADD COLUMN employees_per_shop integer NOT NULL DEFAULT 2 CHECK (employees_per_shop >= 0),
 ADD COLUMN employees_per_storage integer NOT NULL DEFAULT 1 CHECK (employees_per_storage >= 0);
-- Only Basic has a fixed total now. Growth and Business leave it empty, so theirs always comes from their locations.
ALTER TABLE public.subscription_plans ALTER COLUMN max_users DROP NOT NULL;
UPDATE public.subscription_plans SET max_locations = 1, max_users = 2, max_managers = 0, employees_per_shop = 1, employees_per_storage = 0 WHERE id = 'basic';
UPDATE public.subscription_plans SET max_locations = 5, max_users = NULL, max_managers = 1, employees_per_shop = 2, employees_per_storage = 1 WHERE id = 'growth';
UPDATE public.subscription_plans SET max_locations = 10, max_users = NULL, max_managers = 3, employees_per_shop = 2, employees_per_storage = 1, monthly_usd = 50, yearly_usd = 540 WHERE id = 'business';

-- ---------- A store is a location type of its own ----------
ALTER TABLE public.locations DROP CONSTRAINT locations_kind_check;
ALTER TABLE public.locations ADD CONSTRAINT locations_kind_check CHECK (kind IN ('shop', 'store', 'warehouse'));

CREATE OR REPLACE FUNCTION public.enforce_basic_shop_only() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE pid text;
BEGIN
 IF TG_OP = 'UPDATE' AND NEW.kind = OLD.kind THEN RETURN NEW; END IF;
 SELECT s.plan_id INTO pid FROM owner_subscriptions s WHERE s.owner_account_id = NEW.owner_account_id;
 IF pid = 'basic' AND NEW.kind <> 'shop' THEN RAISE EXCEPTION 'LOCATION_TYPE_LIMIT: Basic allows one Shop and no Stores'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS basic_shop_only ON public.locations;
CREATE TRIGGER basic_shop_only BEFORE INSERT OR UPDATE OF kind ON public.locations FOR EACH ROW EXECUTE FUNCTION public.enforce_basic_shop_only();

-- ---------- Seeing a connected warehouse's stock is a permission of its own ----------
INSERT INTO public.permissions (key, owner_only) VALUES ('stock.view_warehouse', false);
INSERT INTO public.role_permissions (role, permission_key) SELECT r, 'stock.view_warehouse' FROM unnest(ARRAY['admin', 'manager', 'shopkeeper', 'warehouse_staff']) r;

-- ---------- The one calculation ----------
/** Admins hold manager-level access across the account, so they use the manager allowance rather than a location's employee slot. */
CREATE FUNCTION public.is_manager_role(p_role text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT p_role IN ('admin', 'manager') $$;
/** Whether this login holds a place. A suspended login still does; a removed one doesn't. */
CREATE FUNCTION public.holds_seat(p_status text) RETURNS boolean LANGUAGE sql IMMUTABLE AS $$ SELECT p_status IN ('active', 'invited', 'suspended') $$;

DROP FUNCTION public.account_usage(uuid);
CREATE FUNCTION public.account_usage(p_account uuid) RETURNS TABLE (plan_id text, status text, usable boolean,
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
 SELECT count(*) INTO emp FROM member_locations ml JOIN owner_members m ON m.id = ml.member_id JOIN locations l ON l.id = ml.location_id
  WHERE m.owner_account_id = p_account AND holds_seat(m.status) AND ((m.role = 'shopkeeper' AND l.kind = 'shop') OR (m.role = 'warehouse_staff' AND l.kind <> 'shop'));
 slots := sh * pl.employees_per_shop + (st + wh) * pl.employees_per_storage;
 -- Basic's fixed total also holds for an older account still above its one location.
 IF pl.id = 'basic' THEN slots := 1; total := 2;
 ELSE total := 1 + pl.max_managers + slots; END IF;
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

/** Each active location's employee logins against its allowance, worked out fresh, so changing a location's type shows at once. */
CREATE FUNCTION public.location_allowances(p_account uuid) RETURNS TABLE (location_id uuid, allowance integer, employees integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT l.id,
  CASE l.kind WHEN 'shop' THEN pl.employees_per_shop ELSE pl.employees_per_storage END,
  (SELECT count(*)::integer FROM member_locations ml JOIN owner_members m ON m.id = ml.member_id WHERE ml.location_id = l.id AND holds_seat(m.status) AND m.role <> 'owner' AND NOT is_manager_role(m.role))
 FROM locations l JOIN owner_subscriptions s ON s.owner_account_id = l.owner_account_id JOIN subscription_plans pl ON pl.id = s.plan_id
 WHERE l.owner_account_id = p_account AND l.status = 'active'
$$;

/** Refuses a login the plan has no room for. A place the person already holds is never counted against them, so a location or
 *  plan change that leaves an account over its limit doesn't stop the owner editing the people already there. */
CREATE FUNCTION public.check_login_allowance(p_account uuid, p_member uuid, p_role text, p_locations uuid[]) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE u record; old owner_members; seated boolean; was_employee boolean; others integer; full_place text;
BEGIN
 SELECT * INTO u FROM account_usage(p_account);
 SELECT * INTO old FROM owner_members WHERE id = p_member;
 seated := FOUND AND holds_seat(old.status);
 was_employee := seated AND NOT is_manager_role(old.role);
 IF is_manager_role(p_role) THEN
  IF NOT (seated AND is_manager_role(old.role)) THEN
   SELECT count(*) INTO others FROM owner_members m WHERE m.owner_account_id = p_account AND holds_seat(m.status) AND is_manager_role(m.role);
   IF others >= u.max_managers THEN
    IF u.max_managers = 0 THEN RAISE EXCEPTION 'MANAGER_LIMIT: your plan has no manager accounts. Upgrade your plan to add a manager'; END IF;
    RAISE EXCEPTION 'MANAGER_LIMIT: your plan allows % manager accounts and you have %. Upgrade your plan or remove a manager to add another', u.max_managers, others;
   END IF;
  END IF;
  RETURN; -- Managers are additional, so they use no location's employee places.
 END IF;
 IF p_role NOT IN ('shopkeeper', 'warehouse_staff') THEN RAISE EXCEPTION 'ROLE_LIMIT: choose Manager, Shopkeeper or Storekeeper'; END IF;
 IF coalesce(cardinality(p_locations), 0) = 0 THEN RAISE EXCEPTION 'LOCATION_REQUIRED: assign this employee to at least one location'; END IF;
 SELECT l.name INTO full_place FROM unnest(coalesce(p_locations, '{}')) x JOIN locations l ON l.id = x
  WHERE l.owner_account_id = p_account AND l.status = 'active'
   AND ((p_role = 'shopkeeper' AND l.kind <> 'shop') OR (p_role = 'warehouse_staff' AND l.kind = 'shop')) LIMIT 1;
 IF FOUND THEN RAISE EXCEPTION 'LOCATION_ROLE: % cannot be assigned this role', full_place; END IF;
 IF NOT was_employee AND u.active_employees >= u.employee_slots THEN
  RAISE EXCEPTION 'USER_LIMIT: your locations allow % employee logins and you have %. Upgrade your plan, add a location or remove a login to add another', u.employee_slots, u.active_employees;
 END IF;
 SELECT l.name INTO full_place FROM unnest(coalesce(p_locations, '{}')) x JOIN locations l ON l.id = x JOIN location_allowances(p_account) a ON a.location_id = l.id
 WHERE a.employees >= a.allowance AND NOT (was_employee AND p_role = old.role AND EXISTS (SELECT 1 FROM member_locations ml WHERE ml.member_id = p_member AND ml.location_id = l.id)) LIMIT 1;
 IF FOUND THEN RAISE EXCEPTION 'LOCATION_USER_LIMIT: % already has all the employee logins it allows. Upgrade your plan, or choose another location', full_place; END IF;
END $$;

-- ---------- Every way a login can take or change a place ----------
CREATE OR REPLACE FUNCTION public.create_login(p_account uuid, p_employee_ref text, p_full_name text, p_phone text, p_email text, p_code text, p_role text, p_businesses uuid[], p_locations uuid[], p_days integer DEFAULT 7) RETURNS TABLE (member_id uuid, invitation_id uuid, token text, expires_at timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE u record; m owner_members; mid uuid; em text := nullif(lower(trim(coalesce(p_email, ''))), ''); ph text := norm_phone(p_phone); inv record;
BEGIN
 IF NOT has_permission(p_account, 'employees.invite') THEN RAISE EXCEPTION 'Not allowed'; END IF;
 IF p_role NOT IN ('admin', 'manager', 'shopkeeper', 'warehouse_staff', 'staff') THEN RAISE EXCEPTION 'Choose a valid role'; END IF;
 IF p_role = 'admin' AND NOT is_account_owner(p_account) THEN RAISE EXCEPTION 'Only the owner can invite an admin'; END IF;
 IF coalesce(trim(p_full_name), '') = '' OR coalesce(trim(p_employee_ref), '') = '' THEN RAISE EXCEPTION 'Enter the employee''s name'; END IF;
 IF em IS NOT NULL AND em !~ '^\S+@\S+\.\S+$' THEN RAISE EXCEPTION 'Enter a valid email'; END IF;
 IF ph IS NOT NULL AND length(ph) < 7 THEN RAISE EXCEPTION 'Enter a valid phone number'; END IF;
 IF em IS NULL AND ph IS NULL THEN RAISE EXCEPTION 'A login needs a phone number or email'; END IF;
 PERFORM check_assignments(p_account, p_businesses, p_locations);
 PERFORM lock_account(p_account);
 SELECT * INTO m FROM owner_members o WHERE o.owner_account_id = p_account AND o.employee_ref = p_employee_ref;
 IF FOUND AND m.status <> 'revoked' THEN RAISE EXCEPTION 'This employee already has a login account'; END IF;
 IF EXISTS (SELECT 1 FROM owner_members o WHERE o.owner_account_id = p_account AND o.status <> 'revoked' AND o.id IS DISTINCT FROM m.id AND ((em IS NOT NULL AND lower(o.email) = em) OR (ph IS NOT NULL AND o.phone_norm = ph))) THEN RAISE EXCEPTION 'Another login already uses this phone number or email'; END IF;
 SELECT * INTO u FROM account_usage(p_account);
 IF NOT u.usable THEN RAISE EXCEPTION 'SUBSCRIPTION_INACTIVE: the subscription is not active'; END IF;
 PERFORM check_login_allowance(p_account, m.id, p_role, p_locations);
 IF m.id IS NULL THEN
  mid := gen_random_uuid();
  -- A phone-only login still needs an address for the sign-in system. It is never shown or written to.
  INSERT INTO owner_members (id, owner_account_id, employee_ref, employee_code, full_name, phone, phone_norm, email, login_email, role, status)
  VALUES (mid, p_account, p_employee_ref, p_code, trim(p_full_name), p_phone, ph, em, coalesce(em, 'phone-' || ph || '-' || left(mid::text, 8) || '@users.shopplus.app'), p_role, 'invited');
 ELSE
  mid := m.id;
  UPDATE owner_members o SET full_name = trim(p_full_name), phone = p_phone, phone_norm = ph, email = em, employee_code = p_code, role = p_role, status = 'invited', terminated_at = NULL,
   login_email = CASE WHEN o.user_id IS NOT NULL THEN o.login_email ELSE coalesce(em, 'phone-' || ph || '-' || left(mid::text, 8) || '@users.shopplus.app') END WHERE o.id = mid;
  DELETE FROM member_businesses x WHERE x.member_id = mid;
  DELETE FROM member_locations x WHERE x.member_id = mid;
 END IF;
 INSERT INTO member_businesses (member_id, business_id) SELECT mid, x FROM unnest(p_businesses) x ON CONFLICT DO NOTHING;
 INSERT INTO member_locations (member_id, location_id) SELECT mid, x FROM unnest(coalesce(p_locations, '{}')) x ON CONFLICT DO NOTHING;
 SELECT * INTO inv FROM issue_invitation(mid, 'invite', p_days);
 PERFORM write_audit(p_account, NULL, NULL, 'LOGIN CREATED', mid::text, NULL, jsonb_build_object('employee', p_employee_ref, 'role', p_role));
 RETURN QUERY SELECT mid, inv.invitation_id, inv.token, inv.expires_at;
END $$;

CREATE OR REPLACE FUNCTION public.new_invitation(p_member uuid, p_days integer DEFAULT 7) RETURNS TABLE (invitation_id uuid, token text, expires_at timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m owner_members;
BEGIN
 SELECT * INTO m FROM owner_members WHERE id = p_member;
 IF NOT FOUND OR NOT is_account_owner(m.owner_account_id) THEN RAISE EXCEPTION 'Only the owner can do this'; END IF;
 IF m.terminated_at IS NOT NULL THEN RAISE EXCEPTION 'This person''s employment has ended'; END IF;
 IF m.status NOT IN ('invited', 'revoked') THEN RAISE EXCEPTION 'This login is already active'; END IF;
 PERFORM lock_account(m.owner_account_id);
 IF m.status = 'revoked' THEN
  PERFORM check_login_allowance(m.owner_account_id, p_member, m.role, ARRAY(SELECT ml.location_id FROM member_locations ml JOIN locations l ON l.id = ml.location_id WHERE ml.member_id = p_member AND l.status = 'active'));
  UPDATE owner_members SET status = 'invited' WHERE id = p_member;
 END IF;
 PERFORM write_audit(m.owner_account_id, NULL, NULL, 'INVITATION RENEWED', p_member::text, NULL, NULL);
 RETURN QUERY SELECT * FROM issue_invitation(p_member, 'invite', p_days);
END $$;

-- Moving someone to a new location or making them a manager is checked like a new login.
CREATE OR REPLACE FUNCTION public.update_member_access(p_member uuid, p_role text, p_businesses uuid[], p_locations uuid[]) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m owner_members := owned_employee(p_member); before_ jsonb;
BEGIN
 IF p_role NOT IN ('admin', 'manager', 'shopkeeper', 'warehouse_staff', 'staff') THEN RAISE EXCEPTION 'Choose a valid role'; END IF;
 PERFORM check_assignments(m.owner_account_id, p_businesses, p_locations);
 PERFORM lock_account(m.owner_account_id);
 IF holds_seat(m.status) THEN PERFORM check_login_allowance(m.owner_account_id, p_member, p_role, p_locations); END IF;
 SELECT jsonb_build_object('role', m.role, 'businesses', (SELECT coalesce(jsonb_agg(business_id), '[]') FROM member_businesses WHERE member_id = p_member), 'locations', (SELECT coalesce(jsonb_agg(location_id), '[]') FROM member_locations WHERE member_id = p_member)) INTO before_;
 UPDATE owner_members SET role = p_role WHERE id = p_member;
 DELETE FROM member_businesses WHERE member_id = p_member;
 DELETE FROM member_locations WHERE member_id = p_member;
 INSERT INTO member_businesses (member_id, business_id) SELECT p_member, x FROM unnest(p_businesses) x ON CONFLICT DO NOTHING;
 INSERT INTO member_locations (member_id, location_id) SELECT p_member, x FROM unnest(coalesce(p_locations, '{}')) x ON CONFLICT DO NOTHING;
 PERFORM write_audit(m.owner_account_id, NULL, NULL, 'ACCESS CHANGED', p_member::text, before_, jsonb_build_object('role', p_role, 'businesses', to_jsonb(p_businesses), 'locations', to_jsonb(coalesce(p_locations, '{}'))));
END $$;

/** A change of type is recorded and the allowance follows it on the next read. Nobody assigned there is removed: if it is now over, it shows as over and takes no one new. */
CREATE OR REPLACE FUNCTION public.sync_location(p_business uuid, p_ref text, p_name text, p_code text, p_kind text, p_active boolean) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE acc uuid; l locations; id_ uuid;
BEGIN
 SELECT owner_account_id INTO acc FROM businesses WHERE id = p_business;
 IF NOT FOUND OR NOT is_account_owner(acc) THEN RAISE EXCEPTION 'Not allowed'; END IF;
 SELECT * INTO l FROM locations WHERE business_id = p_business AND erp_ref = p_ref;
 IF NOT FOUND THEN
  IF NOT p_active THEN RETURN NULL; END IF;
  id_ := create_location(p_business, p_name, coalesce(nullif(trim(p_code), ''), left(p_ref, 12)), p_kind);
  UPDATE locations SET erp_ref = p_ref WHERE id = id_;
  RETURN id_;
 END IF;
 IF l.name <> trim(p_name) OR l.code <> trim(p_code) OR l.kind <> p_kind THEN UPDATE locations SET name = trim(p_name), code = coalesce(nullif(trim(p_code), ''), l.code), kind = p_kind WHERE id = l.id; END IF;
 IF l.kind <> p_kind THEN PERFORM write_audit(acc, p_business, l.id, 'LOCATION TYPE CHANGED', l.id::text, jsonb_build_object('kind', l.kind), jsonb_build_object('kind', p_kind)); END IF;
 IF (l.status = 'active') <> p_active THEN PERFORM set_location_status(l.id, CASE WHEN p_active THEN 'active' ELSE 'archived' END); END IF;
 RETURN l.id;
END $$;

-- ---------- What the Settings screens read ----------
CREATE FUNCTION public.account_entitlements(p_account uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF NOT is_account_owner(p_account) THEN RAISE EXCEPTION 'Only the owner can do this'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('locationId', a.location_id, 'allowance', a.allowance, 'employees', a.employees)), '[]') FROM location_allowances(p_account) a);
END $$;

-- ---------- Who may call what ----------
REVOKE ALL ON FUNCTION public.account_usage(uuid), public.location_allowances(uuid), public.check_login_allowance(uuid, uuid, text, uuid[]), public.account_entitlements(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_usage(uuid), public.account_entitlements(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.account_usage(uuid) TO service_role;
