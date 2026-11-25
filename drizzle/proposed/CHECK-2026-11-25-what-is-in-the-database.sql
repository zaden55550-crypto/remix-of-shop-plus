-- READ-ONLY CHECK (2026-11-25): paste into Lovable Cloud > SQL and run. It changes nothing; it only counts.
-- 1. Every table in the app's part of the database and how many rows each holds (0 everywhere = the fresh start worked).
-- 2. How many online accounts (sign-ins) exist.
-- 3. Whether the owner/login/permission tables exist yet (if "missing", run APPLY-2026-11-25-complete.sql).

SELECT 'table' AS kind, c.relname AS name,
       (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM public.%I', c.relname), false, true, '')))[1]::text AS rows
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
UNION ALL
SELECT 'sign-ins', 'auth.users', (SELECT count(*) FROM auth.users)::text
UNION ALL
SELECT 'needed', t, CASE WHEN to_regclass('public.' || t) IS NULL THEN 'missing' ELSE 'present' END
FROM unnest(ARRAY['owner_accounts', 'owner_members', 'member_permissions', 'subscription_plans', 'plan_payments', 'pending_referrals']) t
ORDER BY 1, 2;
