-- PROPOSED ROLLBACK: never run this without the owner's approval. Copies the earlier definition exactly.
-- Removes the read-only rule: an ended trial blocks employee sign-in again and the server stops refusing uploads. No records change.
DROP TRIGGER shopbook_shop_sync_subscription ON public.shopbook_shop_sync;
DROP FUNCTION public.enforce_subscription_writes();
DROP FUNCTION public.subscription_allows_writes(uuid);
CREATE OR REPLACE FUNCTION public.my_access() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
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
