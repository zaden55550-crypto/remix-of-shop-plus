-- PROPOSED ROLLBACK: never run this without the owner's approval. Copies the earlier definitions exactly.
-- Removes the synced location limit. No records change.
DROP TRIGGER IF EXISTS shopbook_shop_sync_location_limit ON public.shopbook_shop_sync;
DROP FUNCTION IF EXISTS public.enforce_synced_location_limit();
DROP FUNCTION IF EXISTS public.synced_location_status();
DROP FUNCTION IF EXISTS public.synced_location_allowance(uuid);
DROP FUNCTION IF EXISTS public.active_erp_location_ids(jsonb);
-- Deleting a shop's synced records stays closed: nothing in the app does it, and the earlier grant isn't in the repository to restore.
