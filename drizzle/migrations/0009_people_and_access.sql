-- People & Access: individual employee logins on top of the owner accounts in 0008. Nothing existing is removed.
-- The employee record itself stays in the ERP `employees` collection (payroll reads it, and it works with no login).
-- `owner_members` is the login account linked to that record through `employee_ref`; salaries are never copied here.

-- ---------- Current plan limits (the owner counts as a user) ----------
UPDATE public.subscription_plans SET max_locations = 2, max_users = 2 WHERE id = 'basic';
UPDATE public.subscription_plans SET max_locations = 4, max_users = 6 WHERE id = 'growth';
UPDATE public.subscription_plans SET max_locations = 8, max_users = 10 WHERE id = 'business';

-- ---------- Login accounts ----------
CREATE FUNCTION public.norm_phone(p text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
 -- The last nine digits, so 0712 345 678 and +254 712 345 678 are the same phone.
 SELECT nullif(right(regexp_replace(coalesce(p, ''), '\D', '', 'g'), 9), '')
$$;
ALTER TABLE public.owner_members DROP CONSTRAINT owner_members_status_check;
ALTER TABLE public.owner_members ADD CONSTRAINT owner_members_status_check CHECK (status IN ('invited', 'active', 'suspended', 'revoked'));
ALTER TABLE public.owner_members ALTER COLUMN email DROP NOT NULL;
ALTER TABLE public.owner_members
 ADD COLUMN employee_ref text,
 ADD COLUMN employee_code text,
 ADD COLUMN phone_norm text,
 ADD COLUMN login_email text,
 ADD COLUMN terminated_at timestamptz,
 ADD COLUMN sessions_revoked_at timestamptz,
 ADD COLUMN last_login_at timestamptz;
ALTER TABLE public.owner_members ADD CONSTRAINT owner_members_contact CHECK (email IS NOT NULL OR phone_norm IS NOT NULL);
CREATE UNIQUE INDEX owner_members_employee ON public.owner_members (owner_account_id, employee_ref) WHERE employee_ref IS NOT NULL;
CREATE UNIQUE INDEX owner_members_phone ON public.owner_members (owner_account_id, phone_norm) WHERE phone_norm IS NOT NULL;
-- At sign-in a phone or email must lead to exactly one working login.
CREATE UNIQUE INDEX owner_members_login_phone ON public.owner_members (phone_norm) WHERE phone_norm IS NOT NULL AND status IN ('active', 'suspended') AND role <> 'owner';
CREATE UNIQUE INDEX owner_members_login_email ON public.owner_members (lower(email)) WHERE email IS NOT NULL AND status IN ('active', 'suspended') AND role <> 'owner';

ALTER TABLE public.locations ADD COLUMN erp_ref text;
CREATE UNIQUE INDEX locations_erp_ref ON public.locations (business_id, erp_ref) WHERE erp_ref IS NOT NULL;

ALTER TABLE public.employee_invitations
 ADD COLUMN kind text NOT NULL DEFAULT 'invite' CHECK (kind IN ('invite', 'reset')),
 ADD COLUMN attempts integer NOT NULL DEFAULT 0,
 ADD COLUMN sent_via text,
 ADD COLUMN sent_at timestamptz,
 ADD COLUMN send_error text;
CREATE INDEX employee_invitations_member ON public.employee_invitations (member_id, created_at DESC);

CREATE TABLE public.login_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_account_id uuid REFERENCES public.owner_accounts(id) ON DELETE RESTRICT,
 member_id uuid REFERENCES public.owner_members(id) ON DELETE SET NULL,
 identifier text NOT NULL,
 success boolean NOT NULL,
 reason text,
 ip text,
 user_agent text,
 at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX login_events_owner_at ON public.login_events (owner_account_id, at DESC);
CREATE INDEX login_events_identifier_at ON public.login_events (identifier, at DESC);

-- ---------- Permissions: every app gets the same six actions, plus the named sensitive ones ----------
INSERT INTO public.permissions (key, owner_only)
 SELECT 'module.' || m || '.' || a, false
 FROM unnest(ARRAY['dashboard','inventory','purchases','sales','pos','expenses','contacts','float','accounting','payroll','reports','summary','settings']) m,
      unnest(ARRAY['view','create','edit','delete','approve','export']) a;
INSERT INTO public.permissions (key, owner_only) VALUES
 ('employees.manage', false), ('inventory.manage', false), ('purchases.manage', false), ('expenses.manage', false), ('finance.manage_accounts', false),
 ('sales.process', false), ('sales.refund', false), ('reports.manage', false), ('accounting.access', false), ('pos.manage', false), ('stock.transfers', false);

INSERT INTO public.role_permissions (role, permission_key) SELECT 'admin', key FROM public.permissions WHERE NOT owner_only ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions (role, permission_key)
 SELECT 'manager', 'module.' || m || '.' || a
 FROM unnest(ARRAY['dashboard','inventory','purchases','sales','pos','expenses','contacts','float','reports']) m, unnest(ARRAY['view','create','edit','export']) a
 ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions (role, permission_key)
 SELECT 'manager', k FROM unnest(ARRAY['module.purchases.approve','module.expenses.approve','purchases.approve','inventory.manage','purchases.manage','expenses.manage','sales.process','sales.refund','pos.manage','stock.transfers']) k
 ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions (role, permission_key)
 SELECT 'shopkeeper', k FROM unnest(ARRAY['module.dashboard.view','module.sales.view','module.sales.create','module.pos.view','module.pos.create','module.inventory.view','sales.process']) k
 ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions (role, permission_key)
 SELECT 'warehouse_staff', k FROM unnest(ARRAY['module.dashboard.view','module.inventory.view','module.inventory.create','module.inventory.edit','inventory.manage','stock.transfers']) k
 ON CONFLICT DO NOTHING;
-- Staff starts with nothing: they get only what the owner grants.
DELETE FROM public.role_permissions WHERE role = 'staff';

-- The owner's own version of a role template, for this account only.
CREATE TABLE public.account_role_permissions (
 owner_account_id uuid NOT NULL REFERENCES public.owner_accounts(id) ON DELETE RESTRICT,
 role text NOT NULL CHECK (role IN ('admin', 'manager', 'shopkeeper', 'warehouse_staff', 'staff')),
 permission_key text NOT NULL REFERENCES public.permissions(key),
 allowed boolean NOT NULL,
 PRIMARY KEY (owner_account_id, role, permission_key)
);

-- ---------- Who is asking: a suspended person, or a token older than a session revoke, gets nothing ----------
CREATE FUNCTION public.token_is_current(p_revoked timestamptz) RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
 SELECT p_revoked IS NULL OR coalesce((auth.jwt() ->> 'iat')::double precision, 0) >= floor(extract(epoch FROM p_revoked))
$$;
CREATE OR REPLACE FUNCTION public.my_member_id(p_account uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT id FROM owner_members WHERE owner_account_id = p_account AND user_id = auth.uid() AND status = 'active' AND token_is_current(sessions_revoked_at)
$$;
CREATE OR REPLACE FUNCTION public.can_see_business(p_business uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT EXISTS (SELECT 1 FROM businesses b JOIN owner_accounts a ON a.id = b.owner_account_id WHERE b.id = p_business AND a.owner_user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM member_businesses mb JOIN owner_members m ON m.id = mb.member_id WHERE mb.business_id = p_business AND m.user_id = auth.uid() AND m.status = 'active' AND token_is_current(m.sessions_revoked_at))
$$;
CREATE OR REPLACE FUNCTION public.can_see_location(p_location uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT EXISTS (SELECT 1 FROM locations l JOIN owner_accounts a ON a.id = l.owner_account_id WHERE l.id = p_location AND a.owner_user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM member_locations ml JOIN owner_members m ON m.id = ml.member_id WHERE ml.location_id = p_location AND m.user_id = auth.uid() AND m.status = 'active' AND token_is_current(m.sessions_revoked_at))
$$;
/** The person's own setting wins, then the owner's version of the role, then the built-in template. Owner-only keys are never given to anyone else. */
CREATE OR REPLACE FUNCTION public.has_permission(p_account uuid, p_key text) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE m owner_members; own boolean;
BEGIN
 IF is_account_owner(p_account) THEN RETURN EXISTS (SELECT 1 FROM permissions WHERE key = p_key); END IF;
 SELECT * INTO m FROM owner_members WHERE owner_account_id = p_account AND user_id = auth.uid() AND status = 'active' AND token_is_current(sessions_revoked_at);
 IF NOT FOUND OR EXISTS (SELECT 1 FROM permissions WHERE key = p_key AND owner_only) THEN RETURN false; END IF;
 SELECT allowed INTO own FROM member_permissions WHERE member_id = m.id AND permission_key = p_key;
 IF FOUND THEN RETURN own; END IF;
 SELECT allowed INTO own FROM account_role_permissions WHERE owner_account_id = p_account AND role = m.role AND permission_key = p_key;
 IF FOUND THEN RETURN own; END IF;
 RETURN EXISTS (SELECT 1 FROM role_permissions WHERE role = m.role AND permission_key = p_key);
END $$;

-- A suspended login is still an account, so it keeps its seat. Only a removed login frees one.
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

-- ---------- Owner setup ----------
/** Links this device's business to the signed-in owner, once. Later calls return the same records. */
CREATE FUNCTION public.connect_owner(p_account_name text, p_full_name text, p_legacy_business text, p_business_name text, p_currency text, p_country text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE acc uuid; b uuid;
BEGIN
 acc := ensure_owner_account(p_account_name, p_full_name);
 SELECT id INTO b FROM businesses WHERE legacy_business_id = p_legacy_business AND owner_account_id = acc;
 IF NOT FOUND THEN
  IF EXISTS (SELECT 1 FROM businesses WHERE legacy_business_id = p_legacy_business) THEN RAISE EXCEPTION 'This business is linked to another owner'; END IF;
  b := create_business(acc, p_business_name, p_currency, p_country);
  UPDATE businesses SET legacy_business_id = p_legacy_business WHERE id = b;
 END IF;
 RETURN jsonb_build_object('account', acc, 'business', b);
END $$;
/** Keeps the server's copy of an ERP location in step. The plan limit still applies to anything new or reactivated. */
CREATE FUNCTION public.sync_location(p_business uuid, p_ref text, p_name text, p_code text, p_kind text, p_active boolean) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

-- ---------- Login accounts and invitations ----------
DROP FUNCTION public.accept_invitation(text);
DROP FUNCTION public.invite_member(uuid, text, text, text, uuid[], uuid[], integer);

CREATE FUNCTION public.issue_invitation(p_member uuid, p_kind text, p_days integer) RETURNS TABLE (invitation_id uuid, token text, expires_at timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''); e timestamptz := now() + make_interval(days => least(greatest(coalesce(p_days, 7), 1), 30)); i uuid;
BEGIN
 UPDATE employee_invitations inv SET revoked_at = now() WHERE inv.member_id = p_member AND inv.accepted_at IS NULL AND inv.revoked_at IS NULL;
 INSERT INTO employee_invitations (member_id, token_hash, expires_at, kind) VALUES (p_member, encode(sha256(convert_to(t, 'UTF8')), 'hex'), e, p_kind) RETURNING id INTO i;
 RETURN QUERY SELECT i, t, e;
END $$;
CREATE FUNCTION public.check_assignments(p_account uuid, p_businesses uuid[], p_locations uuid[]) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF coalesce(cardinality(p_businesses), 0) = 0 THEN RAISE EXCEPTION 'Choose a business'; END IF;
 IF EXISTS (SELECT 1 FROM unnest(p_businesses) x WHERE NOT EXISTS (SELECT 1 FROM businesses b WHERE b.id = x AND b.owner_account_id = p_account AND b.archived_at IS NULL))
  OR EXISTS (SELECT 1 FROM unnest(coalesce(p_locations, '{}')) x WHERE NOT EXISTS (SELECT 1 FROM locations l WHERE l.id = x AND l.owner_account_id = p_account AND l.status = 'active' AND l.business_id = ANY(p_businesses))) THEN
  RAISE EXCEPTION 'That business or location is not available';
 END IF;
END $$;
/** Takes a seat and returns the one-time link token. Only its hash is stored. A person who already has a login can't get a second. */
CREATE FUNCTION public.create_login(p_account uuid, p_employee_ref text, p_full_name text, p_phone text, p_email text, p_code text, p_role text, p_businesses uuid[], p_locations uuid[], p_days integer DEFAULT 7) RETURNS TABLE (member_id uuid, invitation_id uuid, token text, expires_at timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
/** Replaces any earlier link. Bringing back a login whose invitation was revoked takes a seat again. */
CREATE FUNCTION public.new_invitation(p_member uuid, p_days integer DEFAULT 7) RETURNS TABLE (invitation_id uuid, token text, expires_at timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
CREATE FUNCTION public.revoke_invitation(p_invitation uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i employee_invitations; m owner_members;
BEGIN
 SELECT * INTO i FROM employee_invitations WHERE id = p_invitation;
 IF FOUND THEN SELECT * INTO m FROM owner_members WHERE id = i.member_id; END IF;
 IF m.id IS NULL OR NOT is_account_owner(m.owner_account_id) THEN RAISE EXCEPTION 'Only the owner can do this'; END IF;
 IF i.accepted_at IS NOT NULL OR i.revoked_at IS NOT NULL THEN RAISE EXCEPTION 'This invitation is no longer pending'; END IF;
 UPDATE employee_invitations SET revoked_at = now() WHERE id = p_invitation;
 -- Nobody has accepted, so the seat it held is free again.
 IF m.status = 'invited' THEN UPDATE owner_members SET status = 'revoked' WHERE id = m.id; END IF;
 PERFORM write_audit(m.owner_account_id, NULL, NULL, 'INVITATION REVOKED', m.id::text, NULL, NULL);
END $$;
/** A secure link to set a new password; the old sessions end when it is used. */
CREATE FUNCTION public.create_access_reset(p_member uuid, p_days integer DEFAULT 1) RETURNS TABLE (invitation_id uuid, token text, expires_at timestamptz) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m owner_members;
BEGIN
 SELECT * INTO m FROM owner_members WHERE id = p_member;
 IF NOT FOUND OR NOT is_account_owner(m.owner_account_id) THEN RAISE EXCEPTION 'Only the owner can do this'; END IF;
 IF m.role = 'owner' OR m.status <> 'active' OR m.user_id IS NULL THEN RAISE EXCEPTION 'Only an active employee login can be reset'; END IF;
 PERFORM write_audit(m.owner_account_id, NULL, NULL, 'ACCESS RESET ISSUED', p_member::text, NULL, NULL);
 RETURN QUERY SELECT * FROM issue_invitation(p_member, 'reset', p_days);
END $$;

-- ---------- Used only by trusted server code, never directly by a browser ----------
CREATE FUNCTION public.invitation_details(p_token text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE i employee_invitations; m owner_members; a owner_accounts;
BEGIN
 SELECT * INTO i FROM employee_invitations WHERE token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex');
 IF NOT FOUND OR i.accepted_at IS NOT NULL OR i.revoked_at IS NOT NULL OR i.expires_at < now() OR i.attempts >= 5 THEN RETURN jsonb_build_object('valid', false); END IF;
 SELECT * INTO m FROM owner_members WHERE id = i.member_id;
 SELECT * INTO a FROM owner_accounts WHERE id = m.owner_account_id;
 RETURN jsonb_build_object('valid', true, 'kind', i.kind, 'shop', a.name, 'name', m.full_name, 'role', m.role, 'expiresAt', i.expires_at, 'usesEmail', m.email IS NOT NULL, 'usesPhone', m.phone_norm IS NOT NULL);
END $$;
/** Proves the person holds the phone or email it was issued for. Five wrong tries use the link up. */
CREATE FUNCTION public.verify_invitation(p_token text, p_contact text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i employee_invitations; m owner_members; c text := lower(trim(coalesce(p_contact, '')));
BEGIN
 SELECT * INTO i FROM employee_invitations WHERE token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') FOR UPDATE;
 IF NOT FOUND OR i.accepted_at IS NOT NULL OR i.revoked_at IS NOT NULL OR i.expires_at < now() OR i.attempts >= 5 THEN RETURN jsonb_build_object('ok', false, 'reason', 'invalid'); END IF;
 SELECT * INTO m FROM owner_members WHERE id = i.member_id;
 IF NOT ((m.email IS NOT NULL AND lower(m.email) = c) OR (m.phone_norm IS NOT NULL AND m.phone_norm = norm_phone(c))) THEN
  UPDATE employee_invitations SET attempts = attempts + 1 WHERE id = i.id;
  RETURN jsonb_build_object('ok', false, 'reason', 'contact');
 END IF;
 RETURN jsonb_build_object('ok', true, 'kind', i.kind, 'memberId', m.id, 'loginEmail', m.login_email, 'userId', m.user_id);
END $$;
/** The single-use step: a second call with the same token fails. */
CREATE FUNCTION public.finish_invitation(p_token text, p_user uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i employee_invitations; m owner_members;
BEGIN
 SELECT * INTO i FROM employee_invitations WHERE token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') FOR UPDATE;
 IF NOT FOUND OR i.accepted_at IS NOT NULL OR i.revoked_at IS NOT NULL OR i.expires_at < now() OR i.attempts >= 5 THEN RAISE EXCEPTION 'This invitation is not valid'; END IF;
 SELECT * INTO m FROM owner_members WHERE id = i.member_id FOR UPDATE;
 IF EXISTS (SELECT 1 FROM owner_accounts WHERE owner_user_id = p_user) THEN RAISE EXCEPTION 'This login already owns an account'; END IF;
 IF i.kind = 'invite' AND m.status <> 'invited' THEN RAISE EXCEPTION 'This invitation is not valid'; END IF;
 IF i.kind = 'reset' AND (m.status <> 'active' OR m.user_id IS DISTINCT FROM p_user) THEN RAISE EXCEPTION 'This invitation is not valid'; END IF;
 UPDATE employee_invitations SET accepted_at = now() WHERE id = i.id;
 IF i.kind = 'invite' THEN UPDATE owner_members SET user_id = p_user, status = 'active' WHERE id = m.id;
 ELSE PERFORM end_sessions(m.id); END IF;
 INSERT INTO audit_logs (owner_account_id, user_id, action, record_id) VALUES (m.owner_account_id, p_user, CASE i.kind WHEN 'invite' THEN 'INVITATION ACCEPTED' ELSE 'PASSWORD RESET' END, m.id::text);
 RETURN m.id;
END $$;
CREATE FUNCTION public.mark_invitation_sent(p_invitation uuid, p_via text, p_error text) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
 UPDATE employee_invitations SET sent_via = p_via, sent_at = CASE WHEN p_via IS NOT NULL AND p_error IS NULL THEN now() END, send_error = p_error WHERE id = p_invitation
$$;
CREATE FUNCTION public.invitation_contact(p_invitation uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT jsonb_build_object('name', m.full_name, 'email', m.email, 'phone', m.phone, 'kind', i.kind, 'shop', a.name)
 FROM employee_invitations i JOIN owner_members m ON m.id = i.member_id JOIN owner_accounts a ON a.id = m.owner_account_id WHERE i.id = p_invitation
$$;
/** Finds the login behind a phone or email, and how many recent failures it has had. */
CREATE FUNCTION public.resolve_login(p_identifier text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE id_ text := lower(trim(coalesce(p_identifier, ''))); m owner_members; fails integer;
BEGIN
 SELECT count(*) INTO fails FROM login_events WHERE identifier = id_ AND NOT success AND at > now() - interval '15 minutes';
 SELECT * INTO m FROM owner_members WHERE role <> 'owner' AND status IN ('active', 'suspended') AND ((email IS NOT NULL AND lower(email) = id_) OR (position('@' IN id_) = 0 AND phone_norm IS NOT NULL AND phone_norm = norm_phone(id_))) LIMIT 1;
 IF NOT FOUND THEN RETURN jsonb_build_object('found', false, 'failures', fails); END IF;
 RETURN jsonb_build_object('found', true, 'failures', fails, 'memberId', m.id, 'account', m.owner_account_id, 'status', m.status, 'loginEmail', m.login_email, 'userId', m.user_id);
END $$;
CREATE FUNCTION public.record_login(p_identifier text, p_account uuid, p_member uuid, p_success boolean, p_reason text, p_ip text, p_agent text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 INSERT INTO login_events (owner_account_id, member_id, identifier, success, reason, ip, user_agent) VALUES (p_account, p_member, lower(trim(p_identifier)), p_success, p_reason, left(p_ip, 80), left(p_agent, 300));
 IF p_success THEN UPDATE owner_members SET last_login_at = now() WHERE id = p_member; END IF;
END $$;

-- ---------- Suspending, ending access, changing access ----------
/** Tokens already issued stop working at once. Refresh tokens are removed where the database role is allowed to; the timestamp protects either way. */
CREATE FUNCTION public.end_sessions(p_member uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE u uuid;
BEGIN
 UPDATE owner_members SET sessions_revoked_at = now() WHERE id = p_member RETURNING user_id INTO u;
 IF u IS NOT NULL THEN
  BEGIN DELETE FROM auth.sessions WHERE user_id = u;
  EXCEPTION WHEN insufficient_privilege OR undefined_table THEN NULL; END;
 END IF;
END $$;
CREATE FUNCTION public.owned_employee(p_member uuid) RETURNS public.owner_members LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE m owner_members;
BEGIN
 SELECT * INTO m FROM owner_members WHERE id = p_member;
 IF NOT FOUND OR NOT is_account_owner(m.owner_account_id) THEN RAISE EXCEPTION 'Only the owner can do this'; END IF;
 IF m.role = 'owner' THEN RAISE EXCEPTION 'This can''t be done to the owner'; END IF;
 RETURN m;
END $$;
CREATE FUNCTION public.suspend_member(p_member uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m owner_members := owned_employee(p_member);
BEGIN
 IF m.status <> 'active' THEN RAISE EXCEPTION 'Only an active login can be suspended'; END IF;
 UPDATE owner_members SET status = 'suspended' WHERE id = p_member;
 PERFORM end_sessions(p_member);
 PERFORM write_audit(m.owner_account_id, NULL, NULL, 'LOGIN SUSPENDED', p_member::text, jsonb_build_object('status', m.status), jsonb_build_object('status', 'suspended'));
 RETURN m.user_id;
END $$;
CREATE FUNCTION public.reactivate_member(p_member uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m owner_members := owned_employee(p_member);
BEGIN
 IF m.status <> 'suspended' THEN RAISE EXCEPTION 'Only a suspended login can be reactivated'; END IF;
 UPDATE owner_members SET status = 'active' WHERE id = p_member;
 PERFORM write_audit(m.owner_account_id, NULL, NULL, 'LOGIN REACTIVATED', p_member::text, jsonb_build_object('status', m.status), jsonb_build_object('status', 'active'));
 RETURN m.user_id;
END $$;
CREATE FUNCTION public.revoke_member_sessions(p_member uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m owner_members := owned_employee(p_member);
BEGIN
 PERFORM end_sessions(p_member);
 PERFORM write_audit(m.owner_account_id, NULL, NULL, 'SESSIONS REVOKED', p_member::text, NULL, NULL);
END $$;
/** Access ends and the seat is freed; the person's record and history stay. */
CREATE OR REPLACE FUNCTION public.revoke_member(p_member uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m owner_members;
BEGIN
 SELECT * INTO m FROM owner_members WHERE id = p_member;
 IF NOT FOUND OR NOT is_account_owner(m.owner_account_id) THEN RAISE EXCEPTION 'Only the owner can do this'; END IF;
 IF m.role = 'owner' THEN RAISE EXCEPTION 'The owner can''t be revoked'; END IF;
 UPDATE owner_members SET status = 'revoked' WHERE id = p_member;
 UPDATE employee_invitations SET revoked_at = now() WHERE member_id = p_member AND accepted_at IS NULL AND revoked_at IS NULL;
 PERFORM end_sessions(p_member);
 PERFORM write_audit(m.owner_account_id, NULL, NULL, 'EMPLOYEE REVOKED', p_member::text, jsonb_build_object('status', m.status), jsonb_build_object('status', 'revoked'));
END $$;
CREATE FUNCTION public.terminate_member(p_member uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m owner_members := owned_employee(p_member);
BEGIN
 PERFORM revoke_member(p_member);
 UPDATE owner_members SET terminated_at = now() WHERE id = p_member;
 PERFORM write_audit(m.owner_account_id, NULL, NULL, 'EMPLOYMENT TERMINATED', p_member::text, NULL, NULL);
 RETURN m.user_id;
END $$;
CREATE FUNCTION public.update_member_access(p_member uuid, p_role text, p_businesses uuid[], p_locations uuid[]) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
CREATE FUNCTION public.update_member_profile(p_member uuid, p_full_name text, p_phone text, p_email text, p_code text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m owner_members := owned_employee(p_member); em text := nullif(lower(trim(coalesce(p_email, ''))), ''); ph text := norm_phone(p_phone);
BEGIN
 IF em IS NULL AND ph IS NULL THEN RAISE EXCEPTION 'A login needs a phone number or email'; END IF;
 IF coalesce(trim(p_full_name), '') = '' THEN RAISE EXCEPTION 'Enter the employee''s name'; END IF;
 UPDATE owner_members SET full_name = trim(p_full_name), phone = p_phone, phone_norm = ph, email = em, employee_code = p_code WHERE id = p_member;
 PERFORM write_audit(m.owner_account_id, NULL, NULL, 'LOGIN DETAILS CHANGED', p_member::text, jsonb_build_object('phone', m.phone, 'email', m.email), jsonb_build_object('phone', p_phone, 'email', em));
END $$;
CREATE FUNCTION public.clear_member_permissions(p_member uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m owner_members := owned_employee(p_member);
BEGIN
 DELETE FROM member_permissions WHERE member_id = p_member;
 PERFORM write_audit(m.owner_account_id, NULL, NULL, 'PERMISSIONS RESET TO ROLE', p_member::text, NULL, NULL);
END $$;
CREATE FUNCTION public.set_role_permission(p_account uuid, p_role text, p_key text, p_allowed boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE p permissions;
BEGIN
 IF NOT is_account_owner(p_account) THEN RAISE EXCEPTION 'Only the owner can change permissions'; END IF;
 IF p_role NOT IN ('admin', 'manager', 'shopkeeper', 'warehouse_staff', 'staff') THEN RAISE EXCEPTION 'The owner role can''t be changed'; END IF;
 SELECT * INTO p FROM permissions WHERE key = p_key;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown permission'; END IF;
 IF p.owner_only THEN RAISE EXCEPTION 'This stays with the owner'; END IF;
 INSERT INTO account_role_permissions (owner_account_id, role, permission_key, allowed) VALUES (p_account, p_role, p_key, p_allowed) ON CONFLICT (owner_account_id, role, permission_key) DO UPDATE SET allowed = excluded.allowed;
 PERFORM write_audit(p_account, NULL, NULL, 'ROLE PERMISSION CHANGED', p_role, NULL, jsonb_build_object('permission', p_key, 'allowed', p_allowed));
END $$;

-- ---------- What the app reads ----------
/** Everything a signed-in person is allowed to know about their own access, worked out on the server. */
CREATE FUNCTION public.my_access() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); a owner_accounts; m owner_members; s owner_subscriptions; ok boolean;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign-in required'; END IF;
 SELECT * INTO a FROM owner_accounts WHERE owner_user_id = uid;
 IF FOUND THEN RETURN jsonb_build_object('kind', 'owner', 'account', a.id); END IF;
 SELECT * INTO m FROM owner_members WHERE user_id = uid ORDER BY status = 'active' DESC LIMIT 1;
 IF NOT FOUND THEN RETURN jsonb_build_object('kind', 'none'); END IF;
 IF m.status <> 'active' THEN RETURN jsonb_build_object('kind', 'blocked', 'reason', m.status); END IF;
 IF NOT token_is_current(m.sessions_revoked_at) THEN RETURN jsonb_build_object('kind', 'blocked', 'reason', 'session'); END IF;
 SELECT * INTO s FROM owner_subscriptions WHERE owner_account_id = m.owner_account_id;
 ok := CASE s.status WHEN 'active' THEN true WHEN 'trial' THEN coalesce(s.trial_ends_at > now(), false) WHEN 'past_due' THEN coalesce(s.grace_until > now(), false) ELSE false END;
 IF NOT ok THEN RETURN jsonb_build_object('kind', 'blocked', 'reason', 'subscription'); END IF;
 RETURN jsonb_build_object('kind', 'member', 'account', m.owner_account_id, 'memberId', m.id, 'employeeRef', m.employee_ref, 'fullName', m.full_name, 'email', m.email, 'phone', m.phone, 'role', m.role,
  'plan', s.plan_id, 'subscription', s.status, 'trialEndsAt', s.trial_ends_at,
  'businesses', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'currency', b.currency) ORDER BY b.name), '[]') FROM member_businesses mb JOIN businesses b ON b.id = mb.business_id WHERE mb.member_id = m.id AND b.archived_at IS NULL),
  'locations', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name, 'kind', l.kind, 'businessId', l.business_id, 'erpRef', l.erp_ref) ORDER BY l.name), '[]') FROM member_locations ml JOIN locations l ON l.id = ml.location_id WHERE ml.member_id = m.id AND l.status = 'active'),
  'permissions', (SELECT coalesce(jsonb_agg(p.key), '[]') FROM permissions p WHERE has_permission(m.owner_account_id, p.key)));
END $$;
/** The whole People & Access page for the owner. Invitation hashes never leave the database. */
CREATE FUNCTION public.people_overview(p_account uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE u record;
BEGIN
 IF NOT is_account_owner(p_account) THEN RAISE EXCEPTION 'Only the owner can do this'; END IF;
 SELECT * INTO u FROM account_usage(p_account);
 RETURN jsonb_build_object(
  'usage', to_jsonb(u),
  'plans', (SELECT jsonb_agg(jsonb_build_object('id', id, 'name', name, 'locations', max_locations, 'users', max_users) ORDER BY rank) FROM subscription_plans),
  'businesses', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'legacyId', legacy_business_id) ORDER BY created_at), '[]') FROM businesses WHERE owner_account_id = p_account AND archived_at IS NULL),
  'locations', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name, 'kind', kind, 'businessId', business_id, 'erpRef', erp_ref, 'status', status) ORDER BY name), '[]') FROM locations WHERE owner_account_id = p_account),
  'members', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'employeeRef', m.employee_ref, 'code', m.employee_code, 'name', m.full_name, 'email', m.email, 'phone', m.phone, 'role', m.role, 'status', m.status, 'hasLogin', m.user_id IS NOT NULL, 'lastLoginAt', m.last_login_at, 'terminatedAt', m.terminated_at, 'createdAt', m.created_at,
    'businesses', (SELECT coalesce(jsonb_agg(x.business_id), '[]') FROM member_businesses x WHERE x.member_id = m.id),
    'locations', (SELECT coalesce(jsonb_agg(x.location_id), '[]') FROM member_locations x WHERE x.member_id = m.id),
    'overrides', (SELECT coalesce(jsonb_object_agg(x.permission_key, x.allowed), '{}') FROM member_permissions x WHERE x.member_id = m.id)) ORDER BY m.created_at), '[]') FROM owner_members m WHERE m.owner_account_id = p_account AND m.role <> 'owner'),
  'invitations', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'memberId', i.member_id, 'kind', i.kind, 'createdAt', i.created_at, 'expiresAt', i.expires_at, 'sentVia', i.sent_via, 'sentAt', i.sent_at, 'sendError', i.send_error,
    'status', CASE WHEN i.accepted_at IS NOT NULL THEN 'Accepted' WHEN i.revoked_at IS NOT NULL THEN 'Revoked' WHEN i.expires_at < now() OR i.attempts >= 5 THEN 'Expired' ELSE 'Pending' END) ORDER BY i.created_at DESC), '[]')
    FROM employee_invitations i JOIN owner_members m ON m.id = i.member_id WHERE m.owner_account_id = p_account),
  'permissions', (SELECT jsonb_agg(jsonb_build_object('key', key, 'ownerOnly', owner_only)) FROM permissions),
  'roleDefaults', (SELECT coalesce(jsonb_agg(jsonb_build_object('role', role, 'key', permission_key)), '[]') FROM role_permissions),
  'roleChanges', (SELECT coalesce(jsonb_agg(jsonb_build_object('role', role, 'key', permission_key, 'allowed', allowed)), '[]') FROM account_role_permissions WHERE owner_account_id = p_account),
  'logins', (SELECT coalesce(jsonb_agg(x), '[]') FROM (SELECT id, member_id AS "memberId", identifier, success, reason, ip, user_agent AS "userAgent", at FROM login_events WHERE owner_account_id = p_account ORDER BY at DESC LIMIT 100) x),
  'activity', (SELECT coalesce(jsonb_agg(x), '[]') FROM (SELECT id, user_id AS "userId", action, record_id AS "recordId", at FROM audit_logs WHERE owner_account_id = p_account ORDER BY at DESC LIMIT 100) x)
 );
END $$;

-- ---------- Who may read and call what ----------
ALTER TABLE public.login_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_role_permissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.login_events, public.account_role_permissions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.login_events, public.account_role_permissions TO service_role;
GRANT SELECT ON public.account_role_permissions TO authenticated;
CREATE POLICY account_role_permissions_read ON public.account_role_permissions FOR SELECT TO authenticated USING (is_account_owner(owner_account_id));

REVOKE ALL ON FUNCTION public.issue_invitation(uuid, text, integer), public.check_assignments(uuid, uuid[], uuid[]), public.end_sessions(uuid), public.owned_employee(uuid), public.token_is_current(timestamptz),
 public.invitation_details(text), public.verify_invitation(text, text), public.finish_invitation(text, uuid), public.mark_invitation_sent(uuid, text, text), public.invitation_contact(uuid), public.resolve_login(text), public.record_login(text, uuid, uuid, boolean, text, text, text),
 public.connect_owner(text, text, text, text, text, text), public.sync_location(uuid, text, text, text, text, boolean), public.create_login(uuid, text, text, text, text, text, text, uuid[], uuid[], integer), public.new_invitation(uuid, integer), public.revoke_invitation(uuid), public.create_access_reset(uuid, integer),
 public.suspend_member(uuid), public.reactivate_member(uuid), public.revoke_member_sessions(uuid), public.terminate_member(uuid), public.update_member_access(uuid, text, uuid[], uuid[]), public.update_member_profile(uuid, text, text, text, text), public.clear_member_permissions(uuid), public.set_role_permission(uuid, text, text, boolean), public.my_access(), public.people_overview(uuid)
 FROM PUBLIC, anon, authenticated;
-- These run inside policies and checks, so the signed-in role needs them.
GRANT EXECUTE ON FUNCTION public.token_is_current(timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.connect_owner(text, text, text, text, text, text), public.sync_location(uuid, text, text, text, text, boolean), public.create_login(uuid, text, text, text, text, text, text, uuid[], uuid[], integer), public.new_invitation(uuid, integer), public.revoke_invitation(uuid), public.create_access_reset(uuid, integer),
 public.suspend_member(uuid), public.reactivate_member(uuid), public.revoke_member_sessions(uuid), public.terminate_member(uuid), public.update_member_access(uuid, text, uuid[], uuid[]), public.update_member_profile(uuid, text, text, text, text), public.clear_member_permissions(uuid), public.set_role_permission(uuid, text, text, boolean), public.my_access(), public.people_overview(uuid)
 TO authenticated;
GRANT EXECUTE ON FUNCTION public.invitation_details(text), public.verify_invitation(text, text), public.finish_invitation(text, uuid), public.mark_invitation_sent(uuid, text, text), public.invitation_contact(uuid), public.resolve_login(text), public.record_login(text, uuid, uuid, boolean, text, text, text) TO service_role;
