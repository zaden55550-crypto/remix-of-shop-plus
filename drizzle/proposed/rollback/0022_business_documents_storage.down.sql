-- Reverses proposed 0022. The policies go, so the app falls back to keeping documents on the device. The bucket and any files in it
-- are left in place on purpose (removing them would delete owners' documents); delete them in Lovable Cloud > Storage if wanted.
DROP POLICY IF EXISTS "Owners read their business documents" ON storage.objects;
DROP POLICY IF EXISTS "Owners add their business documents" ON storage.objects;
DROP POLICY IF EXISTS "Owners replace their business documents" ON storage.objects;
DROP POLICY IF EXISTS "Owners remove their business documents" ON storage.objects;
