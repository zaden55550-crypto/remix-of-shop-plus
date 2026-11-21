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
