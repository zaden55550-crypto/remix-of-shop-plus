-- PROPOSED 0022 (owner approval needed; independent of the others): online copies of business documents.
-- Business Setup's documents (KRA certificate, licences, permits…) are kept on the device in IndexedDB (src/lib/doc-store.ts). This adds
-- a private storage bucket so the app can also keep a copy online: each owner can read, add and remove only the files in their own
-- folder (<their user id>/<document id>). Nothing is public. Until this is applied, uploads are refused and the documents stay on the
-- device exactly as before. Rollback: drizzle/proposed/rollback/0022_business_documents_storage.down.sql.

INSERT INTO storage.buckets (id, name, public) VALUES ('business-documents', 'business-documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Owners read their business documents" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'business-documents' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Owners add their business documents" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'business-documents' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Owners replace their business documents" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'business-documents' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'business-documents' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Owners remove their business documents" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'business-documents' AND (storage.foldername(name))[1] = auth.uid()::text);
