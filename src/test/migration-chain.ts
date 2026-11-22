// The whole database in the order a staging or live deployment would apply it, for tests. The tables the repository has no migration for
// (shop_sync, user_roles) are stand-ins built from the generated types, and `auth` stands in for the sign-in system's.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PGlite } from "@electric-sql/pglite";

export const BASE = `CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
 CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
 CREATE TABLE auth.sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
 CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT jsonb_build_object('email', current_setting('test.email', true), 'iat', 4000000000) $$;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('test.role', true) $$;
 GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;
 CREATE TYPE public.app_role AS ENUM ('support');
 CREATE TABLE public.user_roles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, role public.app_role NOT NULL);
 CREATE FUNCTION public.has_role(p_user uuid, p_role public.app_role) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = p_user AND role = p_role) $$;
 CREATE TABLE public.shopbook_shop_sync (user_id uuid PRIMARY KEY, revision bigint NOT NULL DEFAULT 0, device_id uuid, payload jsonb NOT NULL DEFAULT '{}', updated_at timestamptz NOT NULL DEFAULT now());
 GRANT SELECT, INSERT, UPDATE ON public.shopbook_shop_sync TO authenticated; GRANT ALL ON public.shopbook_shop_sync TO service_role;`;

/** In the migration journal. */
export const JOURNAL = ["0000_system_announcements", "0001_acknowledged_shopbook_operations", "0002_verify_health_and_audited_stock", "0003_bind_sync_projection_to_business", "0004_correct_correlated_stock_validation", "0005_sync_product_setup_records", "0006_sync_purchase_orders_invoices", "0007_sync_locations", "0008_owner_accounts_entitlements_permissions", "0009_people_and_access", "0010_fix_sync_payment_check"];
/** Awaiting approval, in the order they must run. The files keep their working names until they are approved. */
export const PROPOSED = ["0010_fix_sync_validation", "0011_dynamic_user_allowance", "0012_enforce_synced_location_limit", "0013_staff_recording", "0014_trial_read_only", "0015_money_accounts", "0016_flat_login_allowance", "0019_sync_businesses", "0020_member_business_access", "0021_sync_trade_documents"];
/** Reverses PROPOSED, last first. Each is named for the number its migration would take; 0019_sync_businesses keeps its working
 *  number (0018 is already taken by the separate unified-identity proposal) until the owner approves an order. */
export const ROLLBACK = ["0021_sync_trade_documents", "0020_member_business_access", "0019_sync_businesses", "0017_flat_login_allowance", "0016_money_accounts", "0015_trial_read_only", "0014_staff_recording", "0013_enforce_synced_location_limit", "0012_dynamic_user_allowance", "0011_fix_sync_validation"];

export const journalFile = (n: string) => readFileSync(resolve(`drizzle/migrations/${n}.sql`), "utf8");
export const proposedFile = (n: string) => readFileSync(resolve(`drizzle/proposed/${n}.sql`), "utf8");
export const rollbackFile = (n: string) => readFileSync(resolve(`drizzle/proposed/rollback/${n}.down.sql`), "utf8");

export async function applyChain(db: PGlite) {
  await db.exec(BASE);
  for (const f of JOURNAL) await db.exec(journalFile(f));
  for (const f of PROPOSED) await db.exec(proposedFile(f));
}
