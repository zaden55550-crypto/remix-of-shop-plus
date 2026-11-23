-- ZAKRIO SYSTEMS FRESH START, 2026-11-23 (owner's decision: everything so far was test data; delete it all, logins included, no
-- backup). PERMANENT: there is no undo.
--
-- What it deletes: every row in every table of the public schema (businesses, records, sync copies and operations, staff logins and
-- invitations, connections and their keys, M-Pesa and plan payments, online shop pages, referrals, audit and login logs, support
-- chats, announcements…), the files in the business-documents storage bucket, and EVERY online account (email, Google and Apple
-- sign-ins, their sessions and identities).
-- What it keeps: the tables themselves and their rules, and the fixed reference lists the app needs: subscription_plans,
-- permissions, role_permissions and business_type_catalogue.
--
-- How to run: Lovable → Cloud → SQL editor → paste all of this → Run. One transaction: if anything fails, nothing is deleted.
-- Devices are wiped separately by the app itself (src/lib/fresh-start.ts) the first time each one opens the new version.
-- Rehearsed by src/test/bundle-rehearsal.test.ts.
BEGIN;

DO $wipe$
DECLARE keep text[] := ARRAY['subscription_plans', 'permissions', 'role_permissions', 'business_type_catalogue'];
        targets text; t record;
BEGIN
  SELECT string_agg(format('public.%I', tablename), ', ' ORDER BY tablename) INTO targets
  FROM pg_tables WHERE schemaname = 'public' AND tablename <> ALL (keep);
  -- Append-only locks (audit_logs and any like it) are switched off only while emptying, then switched straight back on.
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> ALL (keep) LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER USER', t.tablename);
  END LOOP;
  IF targets IS NOT NULL THEN EXECUTE 'TRUNCATE TABLE ' || targets || ' RESTART IDENTITY CASCADE'; END IF;
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> ALL (keep) LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE TRIGGER USER', t.tablename);
  END LOOP;

  -- Saved business documents (proposed 0022), when that bucket exists.
  IF to_regclass('storage.objects') IS NOT NULL THEN
    EXECUTE $$DELETE FROM storage.objects WHERE bucket_id = 'business-documents'$$;
  END IF;

  -- Every online account; Supabase removes their identities and sessions with them.
  IF to_regclass('auth.users') IS NOT NULL THEN
    EXECUTE 'DELETE FROM auth.users';
  END IF;

  -- Safety check: the reference lists must still be there, or nothing is deleted at all.
  IF to_regclass('public.subscription_plans') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.subscription_plans) THEN
    RAISE EXCEPTION 'subscription_plans would be emptied; nothing was deleted';
  END IF;
  IF to_regclass('public.permissions') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.permissions) THEN
    RAISE EXCEPTION 'permissions would be emptied; nothing was deleted';
  END IF;
END
$wipe$;

COMMIT;

-- After it runs, this shows what is left (only the reference lists should have rows):
SELECT relname AS table_name, n_live_tup AS rows_left FROM pg_stat_user_tables WHERE schemaname = 'public' ORDER BY n_live_tup DESC, relname;
