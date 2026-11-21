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
