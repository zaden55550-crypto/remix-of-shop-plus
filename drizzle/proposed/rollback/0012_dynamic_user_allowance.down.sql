-- PROPOSED ROLLBACK: never run this without the owner's approval. Copies the earlier definitions exactly.
-- Returns to the fixed login totals in 0009. Logins, locations and assignments are kept. The Business price stays at the owner's confirmed $50.
-- It stops with an error if any location is a store, because the earlier rules have no such type. Nothing is changed in that case.
DO $$ BEGIN IF EXISTS (SELECT 1 FROM public.locations WHERE kind = 'store') THEN RAISE EXCEPTION 'Stores exist: change them to a shop or warehouse before rolling back'; END IF; END $$;
DROP FUNCTION public.account_usage(uuid);
CREATE OR REPLACE FUNCTION public.account_usage(p_account uuid) RETURNS TABLE (plan_id text, status text, usable boolean, max_locations integer, active_locations integer, available_locations integer, excess_locations integer, max_users integer, active_users integer, available_users integer, excess_users integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE sub owner_subscriptions; pl subscription_plans; locs integer; seats integer; ok boolean;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' AND NOT has_permission(p_account, 'locations.manage') AND NOT is_account_owner(p_account) THEN RAISE EXCEPTION 'Not allowed'; END IF;
 SELECT * INTO sub FROM owner_subscriptions s WHERE s.owner_account_id = p_account;
 IF NOT FOUND THEN RAISE EXCEPTION 'No subscription'; END IF;
 SELECT * INTO pl FROM subscription_plans p WHERE p.id = sub.plan_id;
 SELECT count(*) INTO locs FROM locations l WHERE l.owner_account_id = p_account AND l.status = 'active';
 SELECT count(*) INTO seats FROM owner_members m WHERE m.owner_account_id = p_account AND m.status IN ('active', 'invited', 'suspended');
 ok := CASE sub.status WHEN 'active' THEN true
  WHEN 'trial' THEN coalesce(sub.trial_ends_at > now(), false)
  WHEN 'past_due' THEN coalesce(sub.grace_until > now(), false)
  ELSE false END;
 RETURN QUERY SELECT pl.id, sub.status, ok, pl.max_locations, locs, greatest(pl.max_locations - locs, 0), greatest(locs - pl.max_locations, 0), pl.max_users, seats, greatest(pl.max_users - seats, 0), greatest(seats - pl.max_users, 0);
END $$;
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
 IF u.active_users >= u.max_users THEN RAISE EXCEPTION 'USER_LIMIT: your plan allows % users, including you, and you have %. Upgrade your plan or remove a login to add another', u.max_users, u.active_users; END IF;
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
DECLARE m owner_members; u record;
BEGIN
 SELECT * INTO m FROM owner_members WHERE id = p_member;
 IF NOT FOUND OR NOT is_account_owner(m.owner_account_id) THEN RAISE EXCEPTION 'Only the owner can do this'; END IF;
 IF m.terminated_at IS NOT NULL THEN RAISE EXCEPTION 'This person''s employment has ended'; END IF;
 IF m.status NOT IN ('invited', 'revoked') THEN RAISE EXCEPTION 'This login is already active'; END IF;
 PERFORM lock_account(m.owner_account_id);
 IF m.status = 'revoked' THEN
  SELECT * INTO u FROM account_usage(m.owner_account_id);
  IF u.active_users >= u.max_users THEN RAISE EXCEPTION 'USER_LIMIT: your plan allows % users, including you, and you have %. Upgrade your plan or remove a login to add another', u.max_users, u.active_users; END IF;
  UPDATE owner_members SET status = 'invited' WHERE id = p_member;
 END IF;
 PERFORM write_audit(m.owner_account_id, NULL, NULL, 'INVITATION RENEWED', p_member::text, NULL, NULL);
 RETURN QUERY SELECT * FROM issue_invitation(p_member, 'invite', p_days);
END $$;
CREATE OR REPLACE FUNCTION public.update_member_access(p_member uuid, p_role text, p_businesses uuid[], p_locations uuid[]) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m owner_members := owned_employee(p_member); before_ jsonb;
BEGIN
 IF p_role NOT IN ('admin', 'manager', 'shopkeeper', 'warehouse_staff', 'staff') THEN RAISE EXCEPTION 'Choose a valid role'; END IF;
 PERFORM check_assignments(m.owner_account_id, p_businesses, p_locations);
 SELECT jsonb_build_object('role', m.role, 'businesses', (SELECT coalesce(jsonb_agg(business_id), '[]') FROM member_businesses WHERE member_id = p_member), 'locations', (SELECT coalesce(jsonb_agg(location_id), '[]') FROM member_locations WHERE member_id = p_member)) INTO before_;
 UPDATE owner_members SET role = p_role WHERE id = p_member;
 DELETE FROM member_businesses WHERE member_id = p_member;
 DELETE FROM member_locations WHERE member_id = p_member;
 INSERT INTO member_businesses (member_id, business_id) SELECT p_member, x FROM unnest(p_businesses) x ON CONFLICT DO NOTHING;
 INSERT INTO member_locations (member_id, location_id) SELECT p_member, x FROM unnest(coalesce(p_locations, '{}')) x ON CONFLICT DO NOTHING;
 PERFORM write_audit(m.owner_account_id, NULL, NULL, 'ACCESS CHANGED', p_member::text, before_, jsonb_build_object('role', p_role, 'businesses', to_jsonb(p_businesses), 'locations', to_jsonb(coalesce(p_locations, '{}'))));
END $$;
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
 IF (l.status = 'active') <> p_active THEN PERFORM set_location_status(l.id, CASE WHEN p_active THEN 'active' ELSE 'archived' END); END IF;
 RETURN l.id;
END $$;
DROP FUNCTION public.account_entitlements(uuid);
DROP FUNCTION public.check_login_allowance(uuid, uuid, text, uuid[]);
DROP FUNCTION public.location_allowances(uuid);
DROP FUNCTION public.holds_seat(text);
DROP FUNCTION public.is_manager_role(text);
DROP TRIGGER IF EXISTS basic_shop_only ON public.locations;
DROP FUNCTION IF EXISTS public.enforce_basic_shop_only();
DELETE FROM public.member_permissions WHERE permission_key = 'stock.view_warehouse';
DELETE FROM public.account_role_permissions WHERE permission_key = 'stock.view_warehouse';
DELETE FROM public.role_permissions WHERE permission_key = 'stock.view_warehouse';
DELETE FROM public.permissions WHERE key = 'stock.view_warehouse';
ALTER TABLE public.locations DROP CONSTRAINT locations_kind_check;
ALTER TABLE public.locations ADD CONSTRAINT locations_kind_check CHECK (kind IN ('shop', 'warehouse'));
UPDATE public.subscription_plans SET max_locations = 2, max_users = 2 WHERE id = 'basic';
UPDATE public.subscription_plans SET max_locations = 4, max_users = 6 WHERE id = 'growth';
UPDATE public.subscription_plans SET max_locations = 8, max_users = 10 WHERE id = 'business';
ALTER TABLE public.subscription_plans ALTER COLUMN max_users SET NOT NULL;
ALTER TABLE public.subscription_plans DROP COLUMN max_managers, DROP COLUMN employees_per_shop, DROP COLUMN employees_per_storage;
REVOKE ALL ON FUNCTION public.account_usage(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.account_usage(uuid) TO authenticated, service_role;
