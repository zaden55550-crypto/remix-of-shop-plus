-- PROPOSED ROLLBACK: never run this without the owner's approval. Reverses 0020_member_business_access.sql.
-- Employees go back to one permission set and one role for every business they reach (has_permission, my_access: unchanged by 0020, so
-- nothing of theirs needs restoring). Business-specific roles and permission overrides are removed; memberships and locations stay.
-- The erp_ref links are removed; the server businesses themselves (including any created by link_erp_business) are kept.
-- Access to a business linked through 0020 is removed first: without its business-specific overrides, the seat's one permission set would
-- otherwise apply there, which could widen what an employee may do. A rollback may narrow access, never widen it. The first business is kept.

DELETE FROM public.member_locations ml USING public.locations l, public.businesses b
 WHERE ml.location_id = l.id AND l.business_id = b.id AND b.erp_ref IS NOT NULL AND b.erp_ref <> 'biz-main';
DELETE FROM public.member_businesses mb USING public.businesses b
 WHERE mb.business_id = b.id AND b.erp_ref IS NOT NULL AND b.erp_ref <> 'biz-main';

DROP FUNCTION IF EXISTS public.revoke_member_business(uuid, uuid);
DROP FUNCTION IF EXISTS public.grant_member_business(uuid, uuid, text, uuid[], jsonb);
DROP FUNCTION IF EXISTS public.link_erp_business(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.member_business_access(uuid);
DROP FUNCTION IF EXISTS public.has_business_permission(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.business_erp_ref(uuid);
DROP TABLE IF EXISTS public.member_business_permissions;
ALTER TABLE public.member_businesses DROP COLUMN IF EXISTS role;
DROP INDEX IF EXISTS public.businesses_owner_erp_ref;
ALTER TABLE public.businesses DROP COLUMN IF EXISTS erp_ref;
