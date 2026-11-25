-- ZAKRIO SYSTEMS complete go-live script, 2026-11-25. Paste the whole file into Lovable Cloud > SQL and run it once.
-- WHY THIS FILE: the live database (checked 2026-11-25 against its public schema and src/integrations/supabase/types.ts) has only the
-- first sync, backup and support tables (journal migrations 0000-0004). The owner accounts, logins, permissions and plans of journal
-- migrations 0008 and 0009 were never applied, so APPLY-2026-11-22.sql (which starts after 0010) would stop with "relation
-- owner_accounts does not exist". This file is: journal 0008, 0009, 0010, then everything in APPLY-2026-11-22.sql (0010-0013,
-- 0015, 0016, 0019-0026). It leaves out 0014 (trial read-only) and 0018 (unified identity), as the earlier bundle did.
-- One transaction: if any line fails (for example because part of it already exists), nothing at all changes.
-- Rehearsed from an empty database with 0000-0004 by src/test/bundle-rehearsal.test.ts. Undo: drizzle/proposed/rollback, newest first.
BEGIN;

-- ===== journal 0008_owner_accounts_entitlements_permissions =====
-- Master plan, phases 2 and 3 (server foundation). Adds owner accounts, one shared subscription, businesses, locations,
-- employee seats, permissions and an append-only audit log. Nothing existing is changed or removed.
-- The rule throughout: clients may read what they are allowed to see, and every change goes through a function that checks
-- the caller. Subscription changes are not open to clients at all; only trusted server code (service_role) can make them.

-- ---------- Plans: the one place allowances are configured ----------
CREATE TABLE public.subscription_plans (
 id text PRIMARY KEY,
 name text NOT NULL,
 monthly_usd numeric(10,2) NOT NULL CHECK (monthly_usd >= 0),
 yearly_usd numeric(10,2) NOT NULL CHECK (yearly_usd >= 0),
 max_locations integer NOT NULL CHECK (max_locations >= 0),
 max_users integer NOT NULL CHECK (max_users >= 1),
 rank integer NOT NULL
);
INSERT INTO public.subscription_plans (id, name, monthly_usd, yearly_usd, max_locations, max_users, rank) VALUES
 ('basic', 'Basic', 11, 118.80, 1, 1, 1),
 ('growth', 'Growth', 22, 237.60, 4, 7, 2),
 ('business', 'Business', 40, 432, 8, 10, 3);

-- ---------- Ownership ----------
CREATE TABLE public.owner_accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_user_id uuid NOT NULL UNIQUE,
 name text NOT NULL CHECK (length(trim(name)) > 0),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.owner_subscriptions (
 owner_account_id uuid PRIMARY KEY REFERENCES public.owner_accounts(id) ON DELETE RESTRICT,
 plan_id text NOT NULL REFERENCES public.subscription_plans(id),
 status text NOT NULL CHECK (status IN ('trial', 'active', 'past_due', 'cancelled')),
 billing_cycle text CHECK (billing_cycle IN ('monthly', 'yearly')),
 trial_ends_at timestamptz,
 current_period_end timestamptz,
 grace_until timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.subscription_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_account_id uuid NOT NULL REFERENCES public.owner_accounts(id) ON DELETE RESTRICT,
 from_plan text, to_plan text, status text NOT NULL,
 payment_reference text UNIQUE,
 at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.businesses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_account_id uuid NOT NULL REFERENCES public.owner_accounts(id) ON DELETE RESTRICT,
 name text NOT NULL CHECK (length(trim(name)) > 0),
 business_type text,
 country text,
 currency text NOT NULL,
 timezone text,
 legacy_business_id text UNIQUE,
 archived_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX businesses_owner_name ON public.businesses (owner_account_id, lower(name));
CREATE TABLE public.locations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_account_id uuid NOT NULL REFERENCES public.owner_accounts(id) ON DELETE RESTRICT,
 business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
 name text NOT NULL CHECK (length(trim(name)) > 0),
 code text NOT NULL,
 kind text NOT NULL CHECK (kind IN ('shop', 'warehouse')),
 address text,
 phone text,
 status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX locations_business_name ON public.locations (business_id, lower(name));
CREATE UNIQUE INDEX locations_business_code ON public.locations (business_id, lower(code));
CREATE INDEX locations_owner_active ON public.locations (owner_account_id) WHERE status = 'active';

-- ---------- People: a seat is one person with one login, whatever they can reach ----------
CREATE TABLE public.owner_members (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_account_id uuid NOT NULL REFERENCES public.owner_accounts(id) ON DELETE RESTRICT,
 user_id uuid,
 email text NOT NULL,
 full_name text NOT NULL,
 phone text,
 role text NOT NULL CHECK (role IN ('owner', 'admin', 'manager', 'shopkeeper', 'warehouse_staff', 'staff')),
 status text NOT NULL CHECK (status IN ('invited', 'active', 'revoked')),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (owner_account_id, user_id)
);
CREATE UNIQUE INDEX owner_members_email ON public.owner_members (owner_account_id, lower(email));
CREATE INDEX owner_members_user ON public.owner_members (user_id) WHERE status = 'active';
CREATE TABLE public.member_businesses (
 member_id uuid NOT NULL REFERENCES public.owner_members(id) ON DELETE CASCADE,
 business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
 PRIMARY KEY (member_id, business_id)
);
CREATE TABLE public.member_locations (
 member_id uuid NOT NULL REFERENCES public.owner_members(id) ON DELETE CASCADE,
 location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
 PRIMARY KEY (member_id, location_id)
);
CREATE TABLE public.employee_invitations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 member_id uuid NOT NULL REFERENCES public.owner_members(id) ON DELETE CASCADE,
 token_hash text NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL,
 accepted_at timestamptz,
 revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------- Permissions: roles are templates; each person can be changed individually ----------
CREATE TABLE public.permissions (
 key text PRIMARY KEY,
 owner_only boolean NOT NULL DEFAULT false
);
INSERT INTO public.permissions (key, owner_only) VALUES
 ('products.view_selling_price', false), ('products.view_buying_price', false), ('products.edit_selling_price', false), ('products.edit_buying_price', false),
 ('products.view_cost', false), ('products.create', false), ('products.edit', false), ('products.delete', false),
 ('profit.view_margin', false), ('profit.view_business', false),
 ('stock.view', false), ('stock.valuation', false), ('stock.in', false), ('stock.out', false), ('stock.adjust', false), ('stock.request', false), ('stock.approve_request', false), ('stock.dispatch', false), ('stock.receive', false),
 ('pos.access', false), ('sales.create', false), ('sales.cancel', false), ('sales.return', false), ('sales.discount', false), ('sales.view_history', false),
 ('purchases.create', false), ('purchases.approve', false),
 ('expenses.view', false), ('expenses.record', false),
 ('finance.view_balances', false), ('finance.manage_float', false), ('finance.reports', false), ('finance.export', false), ('accounting.view', false),
 ('salary.view', false), ('payroll.manage', false),
 ('employees.view', false), ('employees.invite', false), ('employees.activity', false),
 ('locations.manage', false), ('settings.operational', false), ('audit.view', false),
 ('subscription.manage', true), ('money_transfer.initiate', true), ('money_transfer.approve', true), ('business.transfer_ownership', true), ('owner.grant', true);
CREATE TABLE public.role_permissions (
 role text NOT NULL CHECK (role IN ('admin', 'manager', 'shopkeeper', 'warehouse_staff', 'staff')),
 permission_key text NOT NULL REFERENCES public.permissions(key),
 PRIMARY KEY (role, permission_key)
);
INSERT INTO public.role_permissions (role, permission_key)
 SELECT 'admin', key FROM public.permissions WHERE NOT owner_only;
INSERT INTO public.role_permissions (role, permission_key)
 SELECT 'manager', k FROM unnest(ARRAY['products.view_selling_price','products.create','products.edit','stock.view','stock.in','stock.out','stock.adjust','stock.request','stock.approve_request','stock.receive','pos.access','sales.create','sales.return','sales.discount','sales.view_history','purchases.create','expenses.view','expenses.record','employees.view']) k;
INSERT INTO public.role_permissions (role, permission_key)
 SELECT 'shopkeeper', k FROM unnest(ARRAY['products.view_selling_price','stock.view','stock.request','stock.receive','pos.access','sales.create','sales.view_history']) k;
INSERT INTO public.role_permissions (role, permission_key)
 SELECT 'warehouse_staff', k FROM unnest(ARRAY['stock.view','stock.in','stock.out','stock.dispatch','stock.receive']) k;
INSERT INTO public.role_permissions (role, permission_key) VALUES ('staff', 'products.view_selling_price');
CREATE TABLE public.member_permissions (
 member_id uuid NOT NULL REFERENCES public.owner_members(id) ON DELETE CASCADE,
 permission_key text NOT NULL REFERENCES public.permissions(key),
 allowed boolean NOT NULL,
 PRIMARY KEY (member_id, permission_key)
);

-- ---------- Audit: append only, for everyone ----------
CREATE TABLE public.audit_logs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_account_id uuid NOT NULL REFERENCES public.owner_accounts(id) ON DELETE RESTRICT,
 business_id uuid, location_id uuid,
 user_id uuid,
 action text NOT NULL,
 record_id text,
 before_value jsonb, after_value jsonb,
 at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_owner_at ON public.audit_logs (owner_account_id, at DESC);
CREATE FUNCTION public.audit_logs_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Audit history cannot be changed'; END $$;
CREATE TRIGGER audit_logs_no_change BEFORE UPDATE OR DELETE ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION public.audit_logs_append_only();
CREATE TRIGGER audit_logs_no_truncate BEFORE TRUNCATE ON public.audit_logs FOR EACH STATEMENT EXECUTE FUNCTION public.audit_logs_append_only();

-- ---------- Who is asking ----------
CREATE FUNCTION public.is_account_owner(p_account uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT EXISTS (SELECT 1 FROM owner_accounts WHERE id = p_account AND owner_user_id = auth.uid())
$$;
CREATE FUNCTION public.my_member_id(p_account uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT id FROM owner_members WHERE owner_account_id = p_account AND user_id = auth.uid() AND status = 'active'
$$;
CREATE FUNCTION public.can_see_business(p_business uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT EXISTS (SELECT 1 FROM businesses b JOIN owner_accounts a ON a.id = b.owner_account_id WHERE b.id = p_business AND a.owner_user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM member_businesses mb JOIN owner_members m ON m.id = mb.member_id WHERE mb.business_id = p_business AND m.user_id = auth.uid() AND m.status = 'active')
$$;
CREATE FUNCTION public.can_see_location(p_location uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT EXISTS (SELECT 1 FROM locations l JOIN owner_accounts a ON a.id = l.owner_account_id WHERE l.id = p_location AND a.owner_user_id = auth.uid())
  OR EXISTS (SELECT 1 FROM member_locations ml JOIN owner_members m ON m.id = ml.member_id WHERE ml.location_id = p_location AND m.user_id = auth.uid() AND m.status = 'active')
$$;
/** The owner holds everything. Anyone else: their own setting if one exists, otherwise their role's template; never an owner-only key. */
CREATE FUNCTION public.has_permission(p_account uuid, p_key text) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE m owner_members; own boolean;
BEGIN
 IF is_account_owner(p_account) THEN RETURN EXISTS (SELECT 1 FROM permissions WHERE key = p_key); END IF;
 SELECT * INTO m FROM owner_members WHERE owner_account_id = p_account AND user_id = auth.uid() AND status = 'active';
 IF NOT FOUND OR EXISTS (SELECT 1 FROM permissions WHERE key = p_key AND owner_only) THEN RETURN false; END IF;
 SELECT allowed INTO own FROM member_permissions WHERE member_id = m.id AND permission_key = p_key;
 IF FOUND THEN RETURN own; END IF;
 RETURN EXISTS (SELECT 1 FROM role_permissions WHERE role = m.role AND permission_key = p_key);
END $$;

-- ---------- Entitlements: shared across every business of the owner ----------
CREATE FUNCTION public.account_usage(p_account uuid) RETURNS TABLE (plan_id text, status text, usable boolean, max_locations integer, active_locations integer, available_locations integer, excess_locations integer, max_users integer, active_users integer, available_users integer, excess_users integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE sub owner_subscriptions; pl subscription_plans; locs integer; seats integer; ok boolean;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' AND NOT has_permission(p_account, 'locations.manage') AND NOT is_account_owner(p_account) THEN RAISE EXCEPTION 'Not allowed'; END IF;
 SELECT * INTO sub FROM owner_subscriptions s WHERE s.owner_account_id = p_account;
 IF NOT FOUND THEN RAISE EXCEPTION 'No subscription'; END IF;
 SELECT * INTO pl FROM subscription_plans p WHERE p.id = sub.plan_id;
 SELECT count(*) INTO locs FROM locations l WHERE l.owner_account_id = p_account AND l.status = 'active';
 SELECT count(*) INTO seats FROM owner_members m WHERE m.owner_account_id = p_account AND m.status IN ('active', 'invited');
 ok := CASE sub.status WHEN 'active' THEN true
  WHEN 'trial' THEN coalesce(sub.trial_ends_at > now(), false)
  WHEN 'past_due' THEN coalesce(sub.grace_until > now(), false)
  ELSE false END;
 RETURN QUERY SELECT pl.id, sub.status, ok, pl.max_locations, locs, greatest(pl.max_locations - locs, 0), greatest(locs - pl.max_locations, 0), pl.max_users, seats, greatest(pl.max_users - seats, 0), greatest(seats - pl.max_users, 0);
END $$;
-- Two requests at once for the last slot run one after the other: the second sees the first's count.
CREATE FUNCTION public.lock_account(p_account uuid) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
 SELECT pg_advisory_xact_lock(hashtextextended('shop-plus-account:' || p_account::text, 0))
$$;
CREATE FUNCTION public.write_audit(p_account uuid, p_business uuid, p_location uuid, p_action text, p_record text, p_before jsonb, p_after jsonb) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
 INSERT INTO audit_logs (owner_account_id, business_id, location_id, user_id, action, record_id, before_value, after_value) VALUES (p_account, p_business, p_location, auth.uid(), p_action, p_record, p_before, p_after)
$$;

-- ---------- Owner actions ----------
/** First call makes the caller an owner on a 30-day trial; later calls return the same account. */
CREATE FUNCTION public.ensure_owner_account(p_name text, p_full_name text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE acc uuid; uid uuid := auth.uid();
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign-in required'; END IF;
 SELECT id INTO acc FROM owner_accounts WHERE owner_user_id = uid;
 IF FOUND THEN RETURN acc; END IF;
 IF EXISTS (SELECT 1 FROM owner_members WHERE user_id = uid AND status = 'active') THEN RAISE EXCEPTION 'This login already belongs to an employee'; END IF;
 INSERT INTO owner_accounts (owner_user_id, name) VALUES (uid, p_name) RETURNING id INTO acc;
 INSERT INTO owner_subscriptions (owner_account_id, plan_id, status, trial_ends_at) VALUES (acc, 'business', 'trial', now() + interval '30 days');
 INSERT INTO owner_members (owner_account_id, user_id, email, full_name, role, status) VALUES (acc, uid, coalesce(auth.jwt() ->> 'email', uid::text), p_full_name, 'owner', 'active');
 PERFORM write_audit(acc, NULL, NULL, 'OWNER ACCOUNT CREATED', acc::text, NULL, jsonb_build_object('name', p_name));
 RETURN acc;
END $$;
CREATE FUNCTION public.create_business(p_account uuid, p_name text, p_currency text, p_country text DEFAULT NULL, p_type text DEFAULT NULL, p_timezone text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b uuid;
BEGIN
 IF NOT is_account_owner(p_account) THEN RAISE EXCEPTION 'Only the owner can create a business'; END IF;
 IF coalesce(trim(p_currency), '') = '' THEN RAISE EXCEPTION 'Choose an operating currency'; END IF;
 INSERT INTO businesses (owner_account_id, name, currency, country, business_type, timezone) VALUES (p_account, trim(p_name), upper(trim(p_currency)), p_country, p_type, p_timezone) RETURNING id INTO b;
 PERFORM write_audit(p_account, b, NULL, 'BUSINESS CREATED', b::text, NULL, jsonb_build_object('name', p_name, 'currency', p_currency));
 RETURN b;
END $$;
CREATE FUNCTION public.create_location(p_business uuid, p_name text, p_code text, p_kind text, p_address text DEFAULT NULL, p_phone text DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE acc uuid; u record; loc uuid;
BEGIN
 SELECT owner_account_id INTO acc FROM businesses WHERE id = p_business AND archived_at IS NULL;
 IF NOT FOUND OR NOT has_permission(acc, 'locations.manage') OR NOT can_see_business(p_business) THEN RAISE EXCEPTION 'Not allowed'; END IF;
 PERFORM lock_account(acc);
 SELECT * INTO u FROM account_usage(acc);
 IF NOT u.usable THEN RAISE EXCEPTION 'The subscription is not active'; END IF;
 IF u.active_locations >= u.max_locations THEN RAISE EXCEPTION 'LOCATION_LIMIT: your plan allows % active locations and you have %. Upgrade to add another', u.max_locations, u.active_locations; END IF;
 INSERT INTO locations (owner_account_id, business_id, name, code, kind, address, phone) VALUES (acc, p_business, trim(p_name), trim(p_code), p_kind, p_address, p_phone) RETURNING id INTO loc;
 PERFORM write_audit(acc, p_business, loc, 'LOCATION CREATED', loc::text, NULL, jsonb_build_object('name', p_name, 'kind', p_kind));
 RETURN loc;
END $$;
CREATE FUNCTION public.set_location_status(p_location uuid, p_status text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l locations; u record;
BEGIN
 SELECT * INTO l FROM locations WHERE id = p_location;
 IF NOT FOUND OR NOT has_permission(l.owner_account_id, 'locations.manage') OR NOT can_see_location(p_location) THEN RAISE EXCEPTION 'Not allowed'; END IF;
 IF p_status NOT IN ('active', 'archived') THEN RAISE EXCEPTION 'Invalid status'; END IF;
 IF l.status = p_status THEN RETURN; END IF;
 PERFORM lock_account(l.owner_account_id);
 SELECT * INTO u FROM account_usage(l.owner_account_id);
 IF p_status = 'active' AND u.active_locations >= u.max_locations THEN RAISE EXCEPTION 'LOCATION_LIMIT: your plan allows % active locations and you have %. Upgrade or archive another first', u.max_locations, u.active_locations; END IF;
 UPDATE locations SET status = p_status WHERE id = p_location;
 PERFORM write_audit(l.owner_account_id, l.business_id, p_location, 'LOCATION ' || upper(p_status), p_location::text, jsonb_build_object('status', l.status), jsonb_build_object('status', p_status));
END $$;

-- ---------- Employees ----------
/** Returns the secret link token once. Only its hash is stored, so it can't be read back from the database. */
CREATE FUNCTION public.invite_member(p_account uuid, p_email text, p_full_name text, p_role text, p_businesses uuid[], p_locations uuid[], p_days integer DEFAULT 7) RETURNS TABLE (member_id uuid, token text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE u record; m uuid; t text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
BEGIN
 IF NOT has_permission(p_account, 'employees.invite') THEN RAISE EXCEPTION 'Not allowed'; END IF;
 IF p_role = 'owner' OR p_role NOT IN ('admin', 'manager', 'shopkeeper', 'warehouse_staff', 'staff') THEN RAISE EXCEPTION 'Choose a valid role'; END IF;
 IF p_role = 'admin' AND NOT is_account_owner(p_account) THEN RAISE EXCEPTION 'Only the owner can invite an admin'; END IF;
 IF p_email !~ '^\S+@\S+\.\S+$' THEN RAISE EXCEPTION 'Enter a valid email'; END IF;
 IF EXISTS (SELECT 1 FROM unnest(coalesce(p_businesses, '{}')) x WHERE NOT EXISTS (SELECT 1 FROM businesses b WHERE b.id = x AND b.owner_account_id = p_account))
  OR EXISTS (SELECT 1 FROM unnest(coalesce(p_locations, '{}')) x WHERE NOT EXISTS (SELECT 1 FROM locations l WHERE l.id = x AND l.owner_account_id = p_account)) THEN RAISE EXCEPTION 'That business or location is not yours'; END IF;
 PERFORM lock_account(p_account);
 SELECT * INTO u FROM account_usage(p_account);
 IF NOT u.usable THEN RAISE EXCEPTION 'The subscription is not active'; END IF;
 IF u.active_users >= u.max_users THEN RAISE EXCEPTION 'USER_LIMIT: your plan allows % users and you have %. Upgrade to add another', u.max_users, u.active_users; END IF;
 -- A revoked person coming back takes a seat again, with the same record.
 INSERT INTO owner_members (owner_account_id, email, full_name, role, status) VALUES (p_account, lower(trim(p_email)), p_full_name, p_role, 'invited')
  ON CONFLICT (owner_account_id, lower(email)) DO UPDATE SET status = 'invited', role = excluded.role, full_name = excluded.full_name WHERE owner_members.status = 'revoked'
  RETURNING id INTO m;
 IF m IS NULL THEN RAISE EXCEPTION 'This person is already invited or active'; END IF;
 INSERT INTO member_businesses (member_id, business_id) SELECT m, x FROM unnest(coalesce(p_businesses, '{}')) x ON CONFLICT DO NOTHING;
 INSERT INTO member_locations (member_id, location_id) SELECT m, x FROM unnest(coalesce(p_locations, '{}')) x ON CONFLICT DO NOTHING;
 INSERT INTO employee_invitations (member_id, token_hash, expires_at) VALUES (m, encode(sha256(convert_to(t, 'UTF8')), 'hex'), now() + make_interval(days => greatest(p_days, 1)));
 PERFORM write_audit(p_account, NULL, NULL, 'EMPLOYEE INVITED', m::text, NULL, jsonb_build_object('email', lower(trim(p_email)), 'role', p_role));
 RETURN QUERY SELECT m, t;
END $$;
CREATE FUNCTION public.accept_invitation(p_token text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE i employee_invitations; m owner_members; uid uuid := auth.uid();
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign-in required'; END IF;
 SELECT * INTO i FROM employee_invitations WHERE token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') FOR UPDATE;
 IF NOT FOUND OR i.accepted_at IS NOT NULL OR i.revoked_at IS NOT NULL OR i.expires_at < now() THEN RAISE EXCEPTION 'This invitation is not valid'; END IF;
 SELECT * INTO m FROM owner_members WHERE id = i.member_id;
 IF lower(coalesce(auth.jwt() ->> 'email', '')) <> lower(m.email) THEN RAISE EXCEPTION 'This invitation was sent to another email'; END IF;
 IF m.status <> 'invited' THEN RAISE EXCEPTION 'This invitation is not valid'; END IF;
 IF EXISTS (SELECT 1 FROM owner_accounts WHERE owner_user_id = uid) THEN RAISE EXCEPTION 'This login already owns an account'; END IF;
 UPDATE employee_invitations SET accepted_at = now() WHERE id = i.id;
 UPDATE owner_members SET user_id = uid, status = 'active' WHERE id = m.id;
 PERFORM write_audit(m.owner_account_id, NULL, NULL, 'INVITATION ACCEPTED', m.id::text, NULL, NULL);
 RETURN m.id;
END $$;
/** Access ends and the seat is freed; the person's record and history stay. */
CREATE FUNCTION public.revoke_member(p_member uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m owner_members;
BEGIN
 SELECT * INTO m FROM owner_members WHERE id = p_member;
 IF NOT FOUND OR NOT is_account_owner(m.owner_account_id) THEN RAISE EXCEPTION 'Only the owner can do this'; END IF;
 IF m.role = 'owner' THEN RAISE EXCEPTION 'The owner can''t be revoked'; END IF;
 UPDATE owner_members SET status = 'revoked' WHERE id = p_member;
 UPDATE employee_invitations SET revoked_at = now() WHERE member_id = p_member AND accepted_at IS NULL AND revoked_at IS NULL;
 PERFORM write_audit(m.owner_account_id, NULL, NULL, 'EMPLOYEE REVOKED', p_member::text, jsonb_build_object('status', m.status), jsonb_build_object('status', 'revoked'));
END $$;
CREATE FUNCTION public.set_member_permission(p_member uuid, p_key text, p_allowed boolean) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m owner_members; p permissions;
BEGIN
 SELECT * INTO m FROM owner_members WHERE id = p_member;
 IF NOT FOUND OR NOT is_account_owner(m.owner_account_id) THEN RAISE EXCEPTION 'Only the owner can change permissions'; END IF;
 SELECT * INTO p FROM permissions WHERE key = p_key;
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown permission'; END IF;
 IF p.owner_only THEN RAISE EXCEPTION 'This stays with the owner'; END IF;
 INSERT INTO member_permissions (member_id, permission_key, allowed) VALUES (p_member, p_key, p_allowed) ON CONFLICT (member_id, permission_key) DO UPDATE SET allowed = excluded.allowed;
 PERFORM write_audit(m.owner_account_id, NULL, NULL, 'PERMISSION CHANGED', p_member::text, NULL, jsonb_build_object('permission', p_key, 'allowed', p_allowed));
END $$;

-- ---------- Subscriptions: trusted server code only ----------
/** Called by payment verification on the server. `p_reference` makes a repeated provider callback do nothing. */
CREATE FUNCTION public.apply_verified_subscription(p_account uuid, p_plan text, p_cycle text, p_period_end timestamptz, p_reference text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s owner_subscriptions;
BEGIN
 IF EXISTS (SELECT 1 FROM subscription_events WHERE payment_reference = p_reference) THEN RETURN; END IF;
 SELECT * INTO s FROM owner_subscriptions WHERE owner_account_id = p_account FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'No subscription'; END IF;
 UPDATE owner_subscriptions SET plan_id = p_plan, status = 'active', billing_cycle = p_cycle, current_period_end = p_period_end, grace_until = NULL, updated_at = now() WHERE owner_account_id = p_account;
 INSERT INTO subscription_events (owner_account_id, from_plan, to_plan, status, payment_reference) VALUES (p_account, s.plan_id, p_plan, 'active', p_reference);
 INSERT INTO audit_logs (owner_account_id, action, record_id, before_value, after_value) VALUES (p_account, 'SUBSCRIPTION CHANGED', p_reference, jsonb_build_object('plan', s.plan_id), jsonb_build_object('plan', p_plan));
END $$;

-- ---------- Who may read what ----------
DO $$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['subscription_plans','owner_accounts','owner_subscriptions','subscription_events','businesses','locations','owner_members','member_businesses','member_locations','employee_invitations','permissions','role_permissions','member_permissions','audit_logs'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
 END LOOP;
END $$;
GRANT SELECT ON public.subscription_plans, public.owner_accounts, public.owner_subscriptions, public.subscription_events, public.businesses, public.locations, public.owner_members, public.member_businesses, public.member_locations, public.permissions, public.role_permissions, public.member_permissions, public.audit_logs TO authenticated;
CREATE POLICY plans_read ON public.subscription_plans FOR SELECT TO authenticated USING (true);
CREATE POLICY permissions_read ON public.permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY role_permissions_read ON public.role_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY accounts_read ON public.owner_accounts FOR SELECT TO authenticated USING (owner_user_id = auth.uid() OR my_member_id(id) IS NOT NULL);
CREATE POLICY subscriptions_read ON public.owner_subscriptions FOR SELECT TO authenticated USING (is_account_owner(owner_account_id));
CREATE POLICY subscription_events_read ON public.subscription_events FOR SELECT TO authenticated USING (is_account_owner(owner_account_id));
CREATE POLICY businesses_read ON public.businesses FOR SELECT TO authenticated USING (can_see_business(id));
CREATE POLICY locations_read ON public.locations FOR SELECT TO authenticated USING (can_see_location(id));
CREATE POLICY members_read ON public.owner_members FOR SELECT TO authenticated USING (user_id = auth.uid() OR has_permission(owner_account_id, 'employees.view'));
CREATE POLICY member_businesses_read ON public.member_businesses FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM owner_members m WHERE m.id = member_id AND (m.user_id = auth.uid() OR has_permission(m.owner_account_id, 'employees.view'))));
CREATE POLICY member_locations_read ON public.member_locations FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM owner_members m WHERE m.id = member_id AND (m.user_id = auth.uid() OR has_permission(m.owner_account_id, 'employees.view'))));
CREATE POLICY member_permissions_read ON public.member_permissions FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM owner_members m WHERE m.id = member_id AND (m.user_id = auth.uid() OR is_account_owner(m.owner_account_id))));
CREATE POLICY audit_read ON public.audit_logs FOR SELECT TO authenticated USING (has_permission(owner_account_id, 'audit.view'));

-- Functions are closed by default; then only the ones a signed-in person may call are opened.
REVOKE ALL ON FUNCTION public.is_account_owner(uuid), public.my_member_id(uuid), public.can_see_business(uuid), public.can_see_location(uuid), public.has_permission(uuid, text), public.account_usage(uuid), public.lock_account(uuid), public.write_audit(uuid, uuid, uuid, text, text, jsonb, jsonb), public.ensure_owner_account(text, text), public.create_business(uuid, text, text, text, text, text), public.create_location(uuid, text, text, text, text, text), public.set_location_status(uuid, text), public.invite_member(uuid, text, text, text, uuid[], uuid[], integer), public.accept_invitation(text), public.revoke_member(uuid), public.set_member_permission(uuid, text, boolean), public.apply_verified_subscription(uuid, text, text, timestamptz, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_account_owner(uuid), public.my_member_id(uuid), public.can_see_business(uuid), public.can_see_location(uuid), public.has_permission(uuid, text), public.account_usage(uuid), public.ensure_owner_account(text, text), public.create_business(uuid, text, text, text, text, text), public.create_location(uuid, text, text, text, text, text), public.set_location_status(uuid, text), public.invite_member(uuid, text, text, text, uuid[], uuid[], integer), public.accept_invitation(text), public.revoke_member(uuid), public.set_member_permission(uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.account_usage(uuid), public.apply_verified_subscription(uuid, text, text, timestamptz, text) TO service_role;

-- ===== journal 0009_people_and_access =====
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

-- ===== journal 0010_fix_sync_payment_check =====
-- Any operation holding a sale or purchase failed with: column reference "key" is ambiguous. The function has a variable called
-- key, and the payment check read a column of the same name. That check now names its own columns. Nothing else changes.
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
 key text;
 val jsonb;
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
   SELECT value INTO current_record FROM jsonb_array_elements(records) WHERE value->>'id' = record_id;
   current_record := coalesce(current_record, 'null'::jsonb);
   IF current_record <> coalesce(change->'before', 'null'::jsonb) THEN RAISE EXCEPTION 'SYNC_CONFLICT: % record % changed on another device; review required', collection, record_id; END IF;
   next_record := coalesce(change->'after', 'null'::jsonb);
   IF next_record <> 'null'::jsonb THEN
     IF jsonb_typeof(next_record) <> 'object' OR next_record->>'id' IS DISTINCT FROM record_id THEN RAISE EXCEPTION 'Invalid record'; END IF;
     IF collection = 'products' AND ((next_record->>'qty')::numeric < 0 OR (next_record->>'buy')::numeric < 0 OR (next_record->>'sell')::numeric < 0) THEN RAISE EXCEPTION 'Invalid stock or price'; END IF;
     IF collection IN ('sales','purchases') THEN
       IF jsonb_typeof(next_record->'items') <> 'array' OR jsonb_typeof(next_record->'pay') <> 'object' OR (next_record->>'total')::numeric < 0 THEN RAISE EXCEPTION 'Invalid transaction'; END IF;
       IF EXISTS (SELECT 1 FROM jsonb_each_text(next_record->'pay') AS split(method, amount) WHERE method NOT IN ('cash','mpesa','bank','credit') OR amount::numeric < 0) THEN RAISE EXCEPTION 'Invalid payment split'; END IF;
       IF abs((SELECT coalesce(sum(value::numeric),0) FROM jsonb_each_text(next_record->'pay')) - (next_record->>'total')::numeric) > 0.01 THEN RAISE EXCEPTION 'Payment allocation does not equal total'; END IF;
       IF collection = 'sales' AND (next_record->'pay'->>'credit')::numeric > 0 AND coalesce(next_record->>'customerId','') = '' THEN RAISE EXCEPTION 'Credit requires a customer'; END IF;
       IF collection = 'purchases' AND (next_record->'pay'->>'credit')::numeric > 0 AND coalesce(next_record->>'supplierId','') = '' THEN RAISE EXCEPTION 'Credit requires a supplier'; END IF;
     END IF;
   END IF;
   SELECT coalesce(jsonb_agg(value), '[]'::jsonb) INTO records FROM jsonb_array_elements(records) WHERE value->>'id' <> record_id;
   IF next_record <> 'null'::jsonb THEN records := records || jsonb_build_array(next_record); END IF;
   current_state := jsonb_set(current_state, ARRAY[collection], records, true);
 END LOOP;
 FOR key, val IN SELECT * FROM jsonb_each(p_seq) LOOP
   current_state := jsonb_set(current_state, '{seq}', coalesce(current_state->'seq','{}'::jsonb) || jsonb_build_object(key, greatest(coalesce((current_state->'seq'->>key)::bigint,0), (val::text)::bigint)), true);
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


-- ===== 0010_fix_sync_validation =====
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

-- ===== 0011_dynamic_user_allowance =====
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

-- ===== 0012_enforce_synced_location_limit =====
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

-- ===== 0013_staff_recording =====
-- PROPOSED: not deployed. This folder is not in the migration journal, so nothing applies it. Move it to drizzle/migrations only after approval.
-- Lets an employee's sale reach the owner's records. Changes no records. Tested by src/test/staff-selling.test.ts.
--
-- The sync function worked only for the signed-in owner. Its body moves unchanged into apply_shopbook_operation_for, which takes the owner,
-- and the old name calls it with the signed-in person, so owners' phones behave exactly as before.
-- apply_member_operation is the one way in for an employee. Only the server can call it, after it has checked what they may do; the database
-- then works out the owner from the login itself and refuses a login that isn't active.

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
REVOKE ALL ON FUNCTION public.apply_shopbook_operation_for(uuid,uuid,uuid,text,text,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_shopbook_operation_for(uuid,uuid,uuid,text,text,jsonb,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.apply_shopbook_operation(p_operation uuid, p_device uuid, p_business text, p_kind text, p_changes jsonb, p_seq jsonb)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
 SELECT public.apply_shopbook_operation_for(auth.uid(), p_operation, p_device, p_business, p_kind, p_changes, p_seq)
$$;
REVOKE ALL ON FUNCTION public.apply_shopbook_operation(uuid,uuid,text,text,jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_shopbook_operation(uuid,uuid,text,text,jsonb,jsonb) TO authenticated, service_role;

CREATE FUNCTION public.apply_member_operation(p_member uuid, p_operation uuid, p_device uuid, p_kind text, p_changes jsonb, p_seq jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE owner_id uuid; bound text;
BEGIN
 SELECT a.owner_user_id INTO owner_id FROM owner_members m JOIN owner_accounts a ON a.id = m.owner_account_id WHERE m.id = p_member AND m.status = 'active';
 IF owner_id IS NULL THEN RAISE EXCEPTION 'Not allowed'; END IF;
 SELECT business_id INTO bound FROM shopbook_sync_business WHERE user_id = owner_id;
 IF bound IS NULL THEN RAISE EXCEPTION 'The owner''s records are not on the server yet'; END IF;
 RETURN public.apply_shopbook_operation_for(owner_id, p_operation, p_device, bound, p_kind, p_changes, p_seq);
END $$;
REVOKE ALL ON FUNCTION public.apply_member_operation(uuid,uuid,uuid,text,jsonb,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_member_operation(uuid,uuid,uuid,text,jsonb,jsonb) TO service_role;

-- ===== 0015_money_accounts =====
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

-- ===== 0016_flat_login_allowance =====
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

-- ===== 0019_sync_businesses =====
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

-- ===== 0020_member_business_access =====
-- PROPOSED: not deployed. This folder is not in the migration journal, so nothing applies it. Move it to drizzle/migrations only after the owner approves it.
-- One employee identity, memberships in several of the owner's businesses (multi-business foundation). Tested by
-- src/test/member-business-access.test.ts and the migration rehearsal. Rollback: drizzle/proposed/rollback/0020_member_business_access.down.sql.
--
-- What exists already (0008/0009): one seat per person per owner (owner_members, one role), member_businesses (which server businesses a
-- seat reaches), member_locations (which locations; every location belongs to one business) and member_permissions (one set for the seat).
-- What this adds, without changing any existing row or function:
-- 1. businesses.erp_ref: the ERP business the server business stands for (`biz-main` for the first, or the app's business id). Without a
--    value, an account's oldest business is the first ERP business (`business_erp_ref`), so no existing row needs updating.
-- 2. member_businesses.role: an optional role for that one business. Without one the seat's role applies, as now.
-- 3. member_business_permissions: per-business permission overrides. Removing a membership removes its overrides (and only its own).
-- 4. has_business_permission(account, business, key): the business override, else the seat's own override (member_permissions), else the
--    business role's account template, else the role's default. A seat with no business-specific rows gets exactly has_permission's answer.
-- 5. member_business_access(account): what the calling employee may reach in that one owner's account (a person can hold seats with
--    several owners; the account is the one my_access chose, so records and permissions always come from the same seat), business by business (role, permissions, locations), for the server's
--    staff snapshot. Only for an active, current login on an account whose subscription lets employees in (as my_access).
-- 6. link_erp_business(...): the owner links (or creates) the server business for an ERP business.
--    grant_member_business(...) / revoke_member_business(...): the owner gives or takes one business's access; other businesses are untouched.
--    Granting keeps the plan's login allowance (check_login_allowance), and a person still counts once however many businesses they reach.
-- Employees can never create a business: the three management functions are owner-only.
-- Must run after 0009 and after the allowance functions (0011/0016). Safe to run again after its rollback.

ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS erp_ref text CHECK (erp_ref IS NULL OR erp_ref ~ '^(biz-main|[a-z0-9]{6,40})$');
CREATE UNIQUE INDEX IF NOT EXISTS businesses_owner_erp_ref ON public.businesses (owner_account_id, erp_ref) WHERE erp_ref IS NOT NULL;
ALTER TABLE public.member_businesses ADD COLUMN IF NOT EXISTS role text CHECK (role IS NULL OR role IN ('admin', 'manager', 'shopkeeper', 'warehouse_staff', 'staff'));

CREATE TABLE IF NOT EXISTS public.member_business_permissions (
 member_id uuid NOT NULL,
 business_id uuid NOT NULL,
 permission_key text NOT NULL REFERENCES public.permissions(key),
 allowed boolean NOT NULL,
 PRIMARY KEY (member_id, business_id, permission_key),
 FOREIGN KEY (member_id, business_id) REFERENCES public.member_businesses (member_id, business_id) ON DELETE CASCADE
);
ALTER TABLE public.member_business_permissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.member_business_permissions FROM PUBLIC, anon, authenticated;

-- The ERP business a server business stands for. An account's oldest business is the first ERP business until it is linked.
CREATE OR REPLACE FUNCTION public.business_erp_ref(p_business uuid) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT coalesce(b.erp_ref, CASE WHEN b.id = (SELECT f.id FROM businesses f WHERE f.owner_account_id = b.owner_account_id ORDER BY f.created_at, f.id LIMIT 1) THEN 'biz-main' END)
 FROM businesses b WHERE b.id = p_business
$$;

CREATE OR REPLACE FUNCTION public.has_business_permission(p_account uuid, p_business uuid, p_key text) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE m owner_members; mb member_businesses; own boolean; r text;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM businesses WHERE id = p_business AND owner_account_id = p_account AND archived_at IS NULL) THEN RETURN false; END IF;
 IF is_account_owner(p_account) THEN RETURN EXISTS (SELECT 1 FROM permissions WHERE key = p_key); END IF;
 SELECT * INTO m FROM owner_members WHERE owner_account_id = p_account AND user_id = auth.uid() AND status = 'active' AND token_is_current(sessions_revoked_at);
 IF NOT FOUND OR EXISTS (SELECT 1 FROM permissions WHERE key = p_key AND owner_only) THEN RETURN false; END IF;
 SELECT * INTO mb FROM member_businesses WHERE member_id = m.id AND business_id = p_business;
 IF NOT FOUND THEN RETURN false; END IF;
 SELECT allowed INTO own FROM member_business_permissions WHERE member_id = m.id AND business_id = p_business AND permission_key = p_key;
 IF FOUND THEN RETURN own; END IF;
 SELECT allowed INTO own FROM member_permissions WHERE member_id = m.id AND permission_key = p_key;
 IF FOUND THEN RETURN own; END IF;
 r := coalesce(mb.role, m.role);
 SELECT allowed INTO own FROM account_role_permissions WHERE owner_account_id = p_account AND role = r AND permission_key = p_key;
 IF FOUND THEN RETURN own; END IF;
 RETURN EXISTS (SELECT 1 FROM role_permissions WHERE role = r AND permission_key = p_key);
END $$;

CREATE OR REPLACE FUNCTION public.member_business_access(p_account uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); m owner_members; s owner_subscriptions; ok boolean;
BEGIN
 IF uid IS NULL THEN RAISE EXCEPTION 'Sign-in required'; END IF;
 SELECT * INTO m FROM owner_members WHERE owner_account_id = p_account AND user_id = uid AND status = 'active' AND token_is_current(sessions_revoked_at);
 IF NOT FOUND THEN RETURN '[]'::jsonb; END IF;
 SELECT * INTO s FROM owner_subscriptions WHERE owner_account_id = m.owner_account_id;
 -- The same subscription gate as my_access: active, a trial (running or ended, which is read-only), or past due within its grace period.
 -- Like my_access, an account with no subscription row is not refused here (ok is null); that behaviour is unchanged from 0009/0014.
 ok := CASE s.status WHEN 'active' THEN true WHEN 'trial' THEN true WHEN 'past_due' THEN coalesce(s.grace_until > now(), false) ELSE false END;
 IF NOT ok THEN RETURN '[]'::jsonb; END IF;
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id', b.id, 'erpRef', business_erp_ref(b.id), 'name', b.name, 'currency', b.currency, 'role', coalesce(mb.role, m.role),
   'permissions', (SELECT coalesce(jsonb_agg(p.key ORDER BY p.key), '[]') FROM permissions p WHERE has_business_permission(m.owner_account_id, b.id, p.key)),
   'locations', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name, 'kind', l.kind, 'erpRef', l.erp_ref) ORDER BY l.name), '[]')
                 FROM member_locations ml JOIN locations l ON l.id = ml.location_id WHERE ml.member_id = m.id AND l.business_id = b.id AND l.status = 'active')
  ) ORDER BY b.created_at, b.id), '[]')
  FROM member_businesses mb JOIN businesses b ON b.id = mb.business_id WHERE mb.member_id = m.id AND b.archived_at IS NULL);
END $$;

-- The owner links an ERP business to a server business, creating the server row the first time. `biz-main` links the oldest business.
CREATE OR REPLACE FUNCTION public.link_erp_business(p_account uuid, p_erp_ref text, p_name text, p_currency text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE found_id uuid;
BEGIN
 IF NOT is_account_owner(p_account) THEN RAISE EXCEPTION 'Only the owner can link a business'; END IF;
 IF p_erp_ref IS NULL OR p_erp_ref !~ '^(biz-main|[a-z0-9]{6,40})$' THEN RAISE EXCEPTION 'Invalid business reference'; END IF;
 IF length(trim(coalesce(p_name, ''))) NOT BETWEEN 1 AND 80 OR coalesce(p_currency, '') !~ '^[A-Z]{3}$' THEN RAISE EXCEPTION 'Invalid business details'; END IF;
 SELECT id INTO found_id FROM businesses WHERE owner_account_id = p_account AND erp_ref = p_erp_ref;
 IF FOUND THEN RETURN found_id; END IF;
 IF p_erp_ref <> 'biz-main' AND EXISTS (SELECT 1 FROM businesses WHERE owner_account_id = p_account AND lower(name) = lower(trim(p_name))) THEN RAISE EXCEPTION 'A business with that name already exists'; END IF;
 IF p_erp_ref = 'biz-main' THEN
   SELECT id INTO found_id FROM businesses WHERE owner_account_id = p_account ORDER BY created_at, id LIMIT 1;
   IF found_id IS NULL THEN RAISE EXCEPTION 'The owner has no business on the server yet'; END IF;
   UPDATE businesses SET erp_ref = 'biz-main' WHERE id = found_id AND erp_ref IS NULL;
   RETURN found_id;
 END IF;
 INSERT INTO businesses (owner_account_id, name, currency, erp_ref) VALUES (p_account, trim(p_name), p_currency, p_erp_ref) RETURNING id INTO found_id;
 INSERT INTO audit_logs (owner_account_id, business_id, user_id, action, record_id) VALUES (p_account, found_id, auth.uid(), 'BUSINESS LINKED', p_erp_ref);
 RETURN found_id;
END $$;

-- The owner gives one seat access to one business: its role there, its locations there and its permission overrides there.
-- Locations and overrides of the seat's other businesses are not touched.
CREATE OR REPLACE FUNCTION public.grant_member_business(p_member uuid, p_business uuid, p_role text, p_locations uuid[], p_permissions jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m owner_members; all_locations uuid[];
BEGIN
 SELECT * INTO m FROM owner_members WHERE id = p_member;
 IF NOT FOUND OR NOT is_account_owner(m.owner_account_id) THEN RAISE EXCEPTION 'Only the owner can change business access'; END IF;
 IF m.role = 'owner' THEN RAISE EXCEPTION 'The owner already reaches every business'; END IF;
 IF NOT EXISTS (SELECT 1 FROM businesses WHERE id = p_business AND owner_account_id = m.owner_account_id AND archived_at IS NULL) THEN RAISE EXCEPTION 'Business not found'; END IF;
 IF p_role IS NOT NULL AND p_role NOT IN ('admin', 'manager', 'shopkeeper', 'warehouse_staff', 'staff') THEN RAISE EXCEPTION 'Invalid role'; END IF;
 IF EXISTS (SELECT 1 FROM unnest(coalesce(p_locations, '{}')) x WHERE NOT EXISTS (SELECT 1 FROM locations l WHERE l.id = x AND l.business_id = p_business AND l.status = 'active')) THEN RAISE EXCEPTION 'A location is not part of this business'; END IF;
 IF p_permissions IS NOT NULL AND (jsonb_typeof(p_permissions) <> 'object' OR EXISTS (SELECT 1 FROM jsonb_each(p_permissions) e WHERE jsonb_typeof(e.value) <> 'boolean' OR NOT EXISTS (SELECT 1 FROM permissions p WHERE p.key = e.key AND NOT p.owner_only))) THEN RAISE EXCEPTION 'Invalid permissions'; END IF;
 -- The seat's whole set of locations after this change must still fit the plan's login allowance.
 SELECT array_agg(x) INTO all_locations FROM (
   SELECT ml.location_id x FROM member_locations ml JOIN locations l ON l.id = ml.location_id WHERE ml.member_id = p_member AND l.business_id <> p_business
   UNION SELECT unnest(coalesce(p_locations, '{}'))) t;
 PERFORM check_login_allowance(m.owner_account_id, p_member, coalesce(p_role, m.role), coalesce(all_locations, '{}'));
 INSERT INTO member_businesses (member_id, business_id, role) VALUES (p_member, p_business, p_role)
 ON CONFLICT (member_id, business_id) DO UPDATE SET role = excluded.role;
 DELETE FROM member_locations ml USING locations l WHERE ml.member_id = p_member AND l.id = ml.location_id AND l.business_id = p_business AND NOT (ml.location_id = ANY(coalesce(p_locations, '{}')));
 INSERT INTO member_locations (member_id, location_id) SELECT p_member, x FROM unnest(coalesce(p_locations, '{}')) x ON CONFLICT DO NOTHING;
 IF p_permissions IS NOT NULL THEN
   DELETE FROM member_business_permissions WHERE member_id = p_member AND business_id = p_business;
   INSERT INTO member_business_permissions (member_id, business_id, permission_key, allowed) SELECT p_member, p_business, e.key, (e.value #>> '{}')::boolean FROM jsonb_each(p_permissions) e;
 END IF;
 INSERT INTO audit_logs (owner_account_id, business_id, user_id, action, record_id) VALUES (m.owner_account_id, p_business, auth.uid(), 'BUSINESS ACCESS GRANTED', p_member::text);
END $$;

-- The owner takes one business's access from a seat. Its other businesses, their locations and their overrides stay as they are.
CREATE OR REPLACE FUNCTION public.revoke_member_business(p_member uuid, p_business uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE m owner_members;
BEGIN
 SELECT * INTO m FROM owner_members WHERE id = p_member;
 IF NOT FOUND OR NOT is_account_owner(m.owner_account_id) THEN RAISE EXCEPTION 'Only the owner can change business access'; END IF;
 DELETE FROM member_locations ml USING locations l WHERE ml.member_id = p_member AND l.id = ml.location_id AND l.business_id = p_business;
 DELETE FROM member_businesses WHERE member_id = p_member AND business_id = p_business; -- its overrides go with it (cascade)
 INSERT INTO audit_logs (owner_account_id, business_id, user_id, action, record_id) VALUES (m.owner_account_id, p_business, auth.uid(), 'BUSINESS ACCESS REVOKED', p_member::text);
END $$;

REVOKE ALL ON FUNCTION public.business_erp_ref(uuid), public.has_business_permission(uuid, uuid, text), public.member_business_access(uuid),
 public.link_erp_business(uuid, text, text, text), public.grant_member_business(uuid, uuid, text, uuid[], jsonb), public.revoke_member_business(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.business_erp_ref(uuid), public.has_business_permission(uuid, uuid, text), public.member_business_access(uuid),
 public.link_erp_business(uuid, text, text, text), public.grant_member_business(uuid, uuid, text, uuid[], jsonb), public.revoke_member_business(uuid, uuid) TO authenticated, service_role;

-- ===== 0021_sync_trade_documents =====
-- PROPOSED 0021 (owner approval needed; runs after 0020): sync lay-bys, quotations and prescriptions.
-- Trade features 5, 6 and 8 keep their documents in three new ERP collections. Until this is applied the app keeps those
-- three collections on the device only (HELD_ON_DEVICE in src/lib/outbox.ts) and syncs their stock movements and payments
-- as usual, so nothing is ever refused. After applying it, empty HELD_ON_DEVICE so they sync like every other record.
-- What changes: apply_shopbook_operation_for from 0019 is repeated exactly, with only the three names added to `allowed`.
-- The documents carry no money or stock of their own (those are payments and movements, already validated), so they need
-- no extra checks.
-- Also (2026-11-22): shopbook_sync_collections() lists the collections this server accepts. The app asks it before deciding
-- what to hold on the device, so once this is applied lay-bys, quotations and prescriptions start syncing with no app change.
-- And a new sale that names a till cashier (cashierId, Staff quick PIN) must name an active employee of that business who has a
-- PIN, already on the server or arriving in the same operation.
-- Rollback: drizzle/proposed/rollback/0021_sync_trade_documents.down.sql (0019's function again).

CREATE OR REPLACE FUNCTION public.shopbook_sync_collections()
RETURNS text[] LANGUAGE sql IMMUTABLE AS $$
 SELECT ARRAY['products','categories','brands','units','attributes','locations','movements','transfers','audit','customers','sales','payments','returns','cash','employees','commissions','payrolls','payrollPayments','suppliers','purchases','purchaseReturns','expenses','expenseCategories','otherContacts','contactCategories','payrollDrafts','purchaseOrders','supplierInvoices','moneyAccounts','businesses','laybys','quotations','prescriptions']
$$;
GRANT EXECUTE ON FUNCTION public.shopbook_sync_collections() TO authenticated, service_role;

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
 allowed text[] := public.shopbook_sync_collections();
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
       IF collection = 'sales' AND current_record = 'null'::jsonb AND coalesce(next_record->>'cashierId','') <> ''
          AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(current_state->'employees','[]'::jsonb)) e
                          WHERE e->>'id' = next_record->>'cashierId' AND coalesce((e->>'active')::boolean, false) AND coalesce(e->>'pin','') <> '')
          AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_changes) c
                          WHERE c->>'collection' = 'employees' AND c->'after'->>'id' = next_record->>'cashierId' AND coalesce((c->'after'->>'active')::boolean, false) AND coalesce(c->'after'->>'pin','') <> '')
       THEN RAISE EXCEPTION 'Invalid cashier: not an active employee with a till PIN'; END IF;
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

-- ===== 0022_business_documents_storage =====
-- PROPOSED 0022 (owner approval needed; independent of the others): online copies of business documents.
-- Business Setup's documents (KRA certificate, licences, permits…) are kept on the device in IndexedDB (src/lib/doc-store.ts). This adds
-- a private storage bucket so the app can also keep a copy online: each owner can read, add and remove only the files in their own
-- folder (<their user id>/<document id>). Nothing is public. Until this is applied, uploads are refused and the documents stay on the
-- device exactly as before. Rollback: drizzle/proposed/rollback/0022_business_documents_storage.down.sql.

INSERT INTO storage.buckets (id, name, public) VALUES ('business-documents', 'business-documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Owners read their business documents" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'business-documents' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Owners add their business documents" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'business-documents' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Owners replace their business documents" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'business-documents' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'business-documents' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Owners remove their business documents" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'business-documents' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ===== 0023_business_integrations =====
-- PROPOSED 0023 (owner approval needed; independent of the others): each business connects its OWN accounts.
-- M-Pesa Daraja, WhatsApp Business (Cloud API), SMS (Africa's Talking) and KRA eTIMS details are saved by the owner from Settings ›
-- Finance › Connections and kept here, on the server only: no policy lets a browser read them back, and the app is only told which
-- connections exist. Server functions (src/lib/integrations.functions.ts) read them with the service role to call the provider.
-- M-Pesa payment results arrive at /api/mpesa-callback and are kept in mpesa_payments, readable by the owner they belong to.
-- Rollback: drizzle/proposed/rollback/0023_business_integrations.down.sql.

CREATE TABLE public.business_integrations (
  owner_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('mpesa', 'airtel', 'mtn', 'orange', 'evc', 'otherpay', 'whatsapp', 'sms', 'etims')),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  accepted_terms_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, kind)
);
ALTER TABLE public.business_integrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.business_integrations FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.business_integrations TO service_role;

CREATE FUNCTION public.save_business_integration(p_kind text, p_config jsonb, p_enabled boolean, p_accept boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Sign-in required'; END IF;
  IF p_kind NOT IN ('mpesa', 'airtel', 'mtn', 'orange', 'evc', 'otherpay', 'whatsapp', 'sms', 'etims') THEN RAISE EXCEPTION 'Unknown connection'; END IF;
  IF NOT coalesce(p_accept, false) THEN RAISE EXCEPTION 'Accept the terms first'; END IF;
  IF jsonb_typeof(p_config) <> 'object' OR octet_length(p_config::text) > 8000 THEN RAISE EXCEPTION 'Invalid details'; END IF;
  INSERT INTO public.business_integrations (owner_id, kind, config, enabled, accepted_terms_at, updated_at)
  VALUES (me, p_kind, p_config, coalesce(p_enabled, true), now(), now())
  ON CONFLICT (owner_id, kind) DO UPDATE SET
    -- A field sent empty keeps its saved value, so secrets never have to be typed again to change one setting.
    config = public.business_integrations.config || (SELECT coalesce(jsonb_object_agg(key, value), '{}'::jsonb) FROM jsonb_each(p_config) WHERE value <> '""'::jsonb),
    enabled = excluded.enabled, accepted_terms_at = now(), updated_at = now();
END $$;

/** Which connections the signed-in owner has, and which fields are filled in. Never the values. */
CREATE FUNCTION public.business_integration_status()
RETURNS TABLE (kind text, enabled boolean, updated_at timestamptz, fields text[]) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.kind, i.enabled, i.updated_at, ARRAY(SELECT k FROM jsonb_object_keys(i.config) k ORDER BY k)
  FROM public.business_integrations i WHERE i.owner_id = auth.uid()
$$;
REVOKE ALL ON FUNCTION public.save_business_integration(text, jsonb, boolean, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.business_integration_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_business_integration(text, jsonb, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.business_integration_status() TO authenticated;

CREATE TABLE public.mpesa_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  checkout_request_id text UNIQUE,
  merchant_request_id text,
  amount numeric NOT NULL CHECK (amount > 0),
  phone text NOT NULL,
  reference text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed')),
  receipt text,
  result_desc text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mpesa_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read their M-Pesa payments" ON public.mpesa_payments FOR SELECT TO authenticated USING (owner_id = auth.uid());
REVOKE ALL ON public.mpesa_payments FROM PUBLIC, anon;
GRANT SELECT ON public.mpesa_payments TO authenticated;
GRANT ALL ON public.mpesa_payments TO service_role;

-- Online shop link: an owner can publish a simple product page at /shop/<slug>. Only name, price, unit and whether it is in stock are
-- shown, and only while the owner has it switched on. Nothing else in the business's records is readable through it.
CREATE TABLE public.public_shops (
  owner_id uuid PRIMARY KEY,
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{2,39}$'),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 80),
  whatsapp text CHECK (whatsapp IS NULL OR whatsapp ~ '^[0-9]{9,15}$'),
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.public_shops ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read their shop page" ON public.public_shops FOR SELECT TO authenticated USING (owner_id = auth.uid());
REVOKE ALL ON public.public_shops FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.public_shops TO authenticated;
GRANT ALL ON public.public_shops TO service_role;

CREATE FUNCTION public.set_public_shop(p_slug text, p_title text, p_whatsapp text, p_enabled boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid();
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Sign-in required'; END IF;
  IF EXISTS (SELECT 1 FROM public.public_shops WHERE slug = lower(p_slug) AND owner_id <> me) THEN RAISE EXCEPTION 'That link is taken; choose another'; END IF;
  INSERT INTO public.public_shops (owner_id, slug, title, whatsapp, enabled, updated_at)
  VALUES (me, lower(p_slug), p_title, nullif(p_whatsapp, ''), coalesce(p_enabled, true), now())
  ON CONFLICT (owner_id) DO UPDATE SET slug = excluded.slug, title = excluded.title, whatsapp = excluded.whatsapp, enabled = excluded.enabled, updated_at = now();
END $$;

/* The public page's data: the shop's title and WhatsApp, and its products (not archived) with price, unit and in-stock only. */
CREATE FUNCTION public.public_shop_catalog(p_slug text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object('title', p.title, 'whatsapp', p.whatsapp, 'products', coalesce((
    SELECT jsonb_agg(jsonb_build_object('name', x->>'name', 'price', (x->>'sell')::numeric, 'unit', x->>'unit', 'inStock', coalesce((x->>'qty')::numeric, 0) > 0) ORDER BY x->>'name')
    FROM jsonb_array_elements(coalesce(s.payload->'products', '[]'::jsonb)) x WHERE coalesce((x->>'archived')::boolean, false) = false), '[]'::jsonb))
  FROM public.public_shops p LEFT JOIN public.shopbook_shop_sync s ON s.user_id = p.owner_id
  WHERE p.slug = lower(p_slug) AND p.enabled
$$;
REVOKE ALL ON FUNCTION public.set_public_shop(text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_public_shop(text, text, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.public_shop_catalog(text) TO anon, authenticated;

-- ===== 0024_plan_payments =====
-- PROPOSED 0024 (owner approval needed; independent of the others): real plan payments by M-Pesa to Zakrio Systems' own Paybill or
-- Till (src/lib/plan-payment.functions.ts). One row per payment prompt. The amount is set by the server from the plan, and the status
-- changes only after Safaricom itself confirms the payment (STK query), so browsers can read their own rows but never write them.
-- Rollback: drizzle/proposed/rollback/0024_plan_payments.down.sql.

CREATE TABLE public.plan_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  plan_id text NOT NULL CHECK (plan_id IN ('basic', 'growth', 'business')),
  billing text NOT NULL CHECK (billing IN ('monthly', 'yearly')),
  amount_kes numeric NOT NULL CHECK (amount_kes > 0),
  phone text NOT NULL,
  checkout_request_id text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed')),
  receipt text,
  result_desc text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX plan_payments_owner_idx ON public.plan_payments (owner_id, created_at DESC);
ALTER TABLE public.plan_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners read their plan payments" ON public.plan_payments FOR SELECT TO authenticated USING (owner_id = auth.uid());
REVOKE ALL ON public.plan_payments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.plan_payments TO authenticated;
GRANT ALL ON public.plan_payments TO service_role;

-- ===== 0025_referrals =====
-- PROPOSED 0025 (owner approval needed; needs 0024 for the "paid" count): invite a shop, get a free month.
-- Every owner gets one short code (my_referral_code). A new owner who signed up through a link records it once (record_referral);
-- nobody can refer themselves or change it later. An owner sees how many shops joined and how many have paid. The free month is
-- given by Zakrio Systems support (rewarded_at), not automatically, so it can be checked first.
-- Rollback: drizzle/proposed/rollback/0025_referrals.down.sql.

CREATE TABLE public.referral_codes (
  owner_id uuid PRIMARY KEY,
  code text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9]{6}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.referrals (
  referred_owner uuid PRIMARY KEY,
  referrer_owner uuid NOT NULL,
  code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  rewarded_at timestamptz,
  CHECK (referred_owner <> referrer_owner)
);
CREATE INDEX referrals_referrer_idx ON public.referrals (referrer_owner);
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.referral_codes, public.referrals FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.referral_codes, public.referrals TO service_role;

/** The signed-in owner's code (made on first ask) and how many shops joined with it and have paid. */
CREATE FUNCTION public.my_referral_code()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid(); c text; tries int := 0; joined int; paid int;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Sign-in required'; END IF;
  SELECT code INTO c FROM referral_codes WHERE owner_id = me;
  WHILE c IS NULL LOOP
    tries := tries + 1;
    c := upper(substr(md5(random()::text || clock_timestamp()::text || me::text), 1, 6));
    IF length(c) <> 6 OR EXISTS (SELECT 1 FROM referral_codes WHERE code = c) THEN c := NULL; ELSE INSERT INTO referral_codes (owner_id, code) VALUES (me, c); END IF;
    IF tries > 20 THEN RAISE EXCEPTION 'Could not make a code'; END IF;
  END LOOP;
  SELECT count(*) INTO joined FROM referrals WHERE referrer_owner = me;
  SELECT count(DISTINCT r.referred_owner) INTO paid FROM referrals r JOIN plan_payments p ON p.owner_id = r.referred_owner AND p.status = 'paid' WHERE r.referrer_owner = me;
  RETURN jsonb_build_object('code', c, 'joined', joined, 'paid', paid);
END $$;

/** Records once that the signed-in (new) owner came through this code. Unknown codes and one's own code are ignored. */
CREATE FUNCTION public.record_referral(p_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid(); ref uuid;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Sign-in required'; END IF;
  SELECT owner_id INTO ref FROM referral_codes WHERE code = upper(trim(p_code));
  IF ref IS NULL OR ref = me THEN RETURN false; END IF;
  INSERT INTO referrals (referred_owner, referrer_owner, code) VALUES (me, ref, upper(trim(p_code))) ON CONFLICT (referred_owner) DO NOTHING;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.my_referral_code(), public.record_referral(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_referral_code(), public.record_referral(text) TO authenticated;


-- ===== 0026_referral_device_codes =====
-- PROPOSED 0026 (owner approval needed; needs 0025 and 0024): invite links work before the owner is online (owner, 2026-11-24).
-- The app shows every owner an invite link at once, with a code made on the device. claim_referral_code(code) makes that code the
-- owner's own on the server (or returns the code they already have; a code someone else holds gets a fresh one). A shop that signs
-- up with a code nobody has claimed yet is kept in pending_referrals and counted for the owner as soon as they claim it.
-- Free months by the inviter's plan are worked out in the app (Basic: every 2 paying shops, Growth: 3, Business: 5); only shops with
-- a paid plan payment count. Support still gives the month (referrals.rewarded_at).
-- Safe to run more than once. Rollback: drizzle/proposed/rollback/0026_referral_device_codes.down.sql.

CREATE TABLE IF NOT EXISTS public.pending_referrals (
  referred_owner uuid PRIMARY KEY,
  code text NOT NULL CHECK (code ~ '^[A-Z0-9]{6}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pending_referrals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.pending_referrals FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.pending_referrals TO service_role;

/** Makes the device's code the signed-in owner's code when they have none yet; moves waiting sign-ups over; returns the counts. */
CREATE OR REPLACE FUNCTION public.claim_referral_code(p_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid(); want text := upper(trim(coalesce(p_code, ''))); c text; joined int; paid int; tries int := 0;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Sign-in required'; END IF;
  SELECT code INTO c FROM referral_codes WHERE owner_id = me;
  IF c IS NULL AND want ~ '^[A-Z0-9]{6}$' AND NOT EXISTS (SELECT 1 FROM referral_codes WHERE code = want) THEN
    INSERT INTO referral_codes (owner_id, code) VALUES (me, want) ON CONFLICT DO NOTHING;
    SELECT code INTO c FROM referral_codes WHERE owner_id = me;
  END IF;
  WHILE c IS NULL LOOP
    tries := tries + 1;
    c := upper(substr(md5(random()::text || clock_timestamp()::text || me::text), 1, 6));
    IF EXISTS (SELECT 1 FROM referral_codes WHERE code = c) THEN c := NULL; ELSE INSERT INTO referral_codes (owner_id, code) VALUES (me, c); END IF;
    IF tries > 20 THEN RAISE EXCEPTION 'Could not make a code'; END IF;
  END LOOP;
  -- Shops that signed up with this code before it was claimed now count (never the owner themselves).
  INSERT INTO referrals (referred_owner, referrer_owner, code)
    SELECT p.referred_owner, me, p.code FROM pending_referrals p WHERE p.code = c AND p.referred_owner <> me
    ON CONFLICT (referred_owner) DO NOTHING;
  DELETE FROM pending_referrals WHERE code = c;
  SELECT count(*) INTO joined FROM referrals WHERE referrer_owner = me;
  SELECT count(DISTINCT r.referred_owner) INTO paid FROM referrals r JOIN plan_payments p ON p.owner_id = r.referred_owner AND p.status = 'paid' WHERE r.referrer_owner = me;
  RETURN jsonb_build_object('code', c, 'joined', joined, 'paid', paid);
END $$;

/** As 0025, and a well-formed code nobody has claimed yet waits in pending_referrals instead of being lost. */
CREATE OR REPLACE FUNCTION public.record_referral(p_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE me uuid := auth.uid(); code_in text := upper(trim(coalesce(p_code, ''))); ref uuid;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Sign-in required'; END IF;
  IF code_in !~ '^[A-Z0-9]{6}$' THEN RETURN false; END IF;
  SELECT owner_id INTO ref FROM referral_codes WHERE code = code_in;
  IF ref = me THEN RETURN false; END IF;
  IF ref IS NULL THEN
    IF EXISTS (SELECT 1 FROM referrals WHERE referred_owner = me) THEN RETURN false; END IF;
    INSERT INTO pending_referrals (referred_owner, code) VALUES (me, code_in) ON CONFLICT (referred_owner) DO NOTHING;
    RETURN true;
  END IF;
  INSERT INTO referrals (referred_owner, referrer_owner, code) VALUES (me, ref, code_in) ON CONFLICT (referred_owner) DO NOTHING;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.claim_referral_code(text), public.record_referral(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_referral_code(text), public.record_referral(text) TO authenticated;

COMMIT;
