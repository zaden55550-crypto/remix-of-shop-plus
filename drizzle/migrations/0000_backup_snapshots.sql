CREATE TABLE public.shopbook_backup_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  device_id uuid NOT NULL,
  shop_name text NOT NULL DEFAULT '',
  kind text NOT NULL DEFAULT 'manual',
  payload text NOT NULL,
  size_bytes integer NOT NULL,
  checksum text NOT NULL,
  record_count integer NOT NULL DEFAULT 0,
  verified_at timestamptz,
  restore_tested_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX shopbook_backup_snapshots_user_idx ON public.shopbook_backup_snapshots(user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.shopbook_backup_snapshots TO authenticated;
GRANT ALL ON public.shopbook_backup_snapshots TO service_role;
ALTER TABLE public.shopbook_backup_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner reads snapshots" ON public.shopbook_backup_snapshots FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "owner creates snapshots" ON public.shopbook_backup_snapshots FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner updates snapshots" ON public.shopbook_backup_snapshots FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "owner prunes snapshots" ON public.shopbook_backup_snapshots FOR DELETE TO authenticated USING (auth.uid() = user_id);