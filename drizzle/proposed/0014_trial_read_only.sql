-- PROPOSED: not deployed. This folder is not in the migration journal, so nothing applies it. Move it to drizzle/migrations only after approval.
-- After the 30-day trial the business is read-only, not locked. Changes no records. Tested by src/test/trial-read-only.test.ts.
--
-- 1. An employee whose employer's trial has ended still signs in and gets their usual, already filtered copy: my_access now returns them as a
--    member with "writable": false instead of blocking them. Roles, permissions, businesses and locations are worked out exactly as before,
--    so the end of a trial never shows anyone more than they could already see. Suspended, revoked, cancelled and past-due logins are unchanged.
-- 2. No record changes once writes aren't allowed: one trigger on the synced records table refuses every insert or update, whichever way it
--    comes in (an owner's device through apply_shopbook_operation, an employee's sale through apply_member_operation, or anything else).
--    An operation that was already applied is still acknowledged, because that path returns before writing.
-- 3. Writes come back the moment the subscription is active. The only way to make it active is apply_verified_subscription (0008), which only
--    the service role can call after a payment is verified.
--
-- An owner with no account on the server yet (People & Access never connected) has no subscription row, so their trial is counted from their
-- first upload. Deploy this together with server-side payment verification: until then a plan bought in PAYMENT_TEST_MODE changes only the
-- device, and the server would still see the trial as ended.

/** Whether this owner's records may change. The same rule as account_usage's `usable`. */
CREATE FUNCTION public.subscription_allows_writes(p_owner_user uuid) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE s owner_subscriptions; first_upload timestamptz;
BEGIN
 SELECT sub.* INTO s FROM owner_accounts a JOIN owner_subscriptions sub ON sub.owner_account_id = a.id WHERE a.owner_user_id = p_owner_user;
 IF FOUND THEN
  RETURN CASE s.status WHEN 'active' THEN true WHEN 'trial' THEN coalesce(s.trial_ends_at > now(), false) WHEN 'past_due' THEN coalesce(s.grace_until > now(), false) ELSE false END;
 END IF;
 SELECT min(o.acknowledged_at) INTO first_upload FROM shopbook_sync_operations o WHERE o.user_id = p_owner_user;
 RETURN first_upload IS NULL OR first_upload + interval '30 days' > now();
END $$;

CREATE FUNCTION public.enforce_subscription_writes() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF NOT subscription_allows_writes(NEW.user_id) THEN
  RAISE EXCEPTION 'SUBSCRIPTION_INACTIVE: the free trial has ended. Records can still be viewed and exported; subscribe to add new transactions';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER shopbook_shop_sync_subscription BEFORE INSERT OR UPDATE ON public.shopbook_shop_sync FOR EACH ROW EXECUTE FUNCTION public.enforce_subscription_writes();

CREATE OR REPLACE FUNCTION public.my_access() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); a owner_accounts; m owner_members; s owner_subscriptions; ok boolean; ended boolean;
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
 -- Only an ended trial becomes read-only; any other inactive subscription is still blocked, as before.
 ended := s.status = 'trial' AND NOT ok;
 IF NOT ok AND NOT ended THEN RETURN jsonb_build_object('kind', 'blocked', 'reason', 'subscription'); END IF;
 RETURN jsonb_build_object('kind', 'member', 'account', m.owner_account_id, 'memberId', m.id, 'employeeRef', m.employee_ref, 'fullName', m.full_name, 'email', m.email, 'phone', m.phone, 'role', m.role,
  'plan', s.plan_id, 'subscription', s.status, 'trialEndsAt', s.trial_ends_at, 'writable', ok,
  'businesses', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'currency', b.currency) ORDER BY b.name), '[]') FROM member_businesses mb JOIN businesses b ON b.id = mb.business_id WHERE mb.member_id = m.id AND b.archived_at IS NULL),
  'locations', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name, 'kind', l.kind, 'businessId', l.business_id, 'erpRef', l.erp_ref) ORDER BY l.name), '[]') FROM member_locations ml JOIN locations l ON l.id = ml.location_id WHERE ml.member_id = m.id AND l.status = 'active'),
  'permissions', (SELECT coalesce(jsonb_agg(p.key), '[]') FROM permissions p WHERE has_permission(m.owner_account_id, p.key)));
END $$;

REVOKE ALL ON FUNCTION public.subscription_allows_writes(uuid), public.enforce_subscription_writes() FROM PUBLIC, anon, authenticated;
