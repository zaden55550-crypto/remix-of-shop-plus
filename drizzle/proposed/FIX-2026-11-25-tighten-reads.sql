-- Security fix (2026-11-25): permission lists only for owners and their staff; announcements only while running (support sees all).
BEGIN;
DROP POLICY IF EXISTS permissions_read ON public.permissions;
CREATE POLICY permissions_read ON public.permissions FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.owner_accounts a WHERE a.owner_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.owner_members m WHERE m.user_id = auth.uid()));
DROP POLICY IF EXISTS role_permissions_read ON public.role_permissions;
CREATE POLICY role_permissions_read ON public.role_permissions FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.owner_accounts a WHERE a.owner_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.owner_members m WHERE m.user_id = auth.uid()));
DROP POLICY IF EXISTS "signed-in read announcements" ON public.system_announcements;
CREATE POLICY "signed-in read announcements" ON public.system_announcements FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'support'::public.app_role)
    OR (active AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now())));
COMMIT;
