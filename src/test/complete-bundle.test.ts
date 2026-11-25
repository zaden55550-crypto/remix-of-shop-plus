// The complete go-live script (drizzle/proposed/APPLY-2026-11-25-complete.sql), rehearsed on a database like the live one on
// 2026-11-25: only journal migrations 0000-0004 applied (owner accounts, logins and permissions missing).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { BASE, JOURNAL, journalFile } from "./migration-chain";

const STORAGE = `CREATE SCHEMA storage; GRANT USAGE ON SCHEMA storage TO authenticated;
  CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean);
  CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text);
  ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY; GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
  CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  GRANT EXECUTE ON FUNCTION storage.foldername(text) TO authenticated;`;
const live = async () => {
  const db = new PGlite();
  await db.exec(BASE);
  for (const f of JOURNAL.slice(0, 5)) await db.exec(journalFile(f));
  await db.exec(STORAGE);
  return db;
};
const script = () => readFileSync(resolve("drizzle/proposed/APPLY-2026-11-25-complete.sql"), "utf8");

describe("complete go-live script", () => {
  it("applies on the live database's state and creates owners, logins, permissions, plans and the newer tables", async () => {
    const db = await live();
    await db.exec(script());
    const tables = (await db.query<{ t: string }>("SELECT tablename t FROM pg_tables WHERE schemaname = 'public'")).rows.map((r) => r.t);
    expect(tables).toEqual(expect.arrayContaining(["owner_accounts", "owner_members", "member_permissions", "subscription_plans", "permissions", "role_permissions", "business_integrations", "plan_payments", "pending_referrals"]));
    const fns = (await db.query<{ p: string }>("SELECT proname p FROM pg_proc WHERE pronamespace = 'public'::regnamespace")).rows.map((r) => r.p);
    expect(fns).toEqual(expect.arrayContaining(["connect_owner", "set_member_permission", "check_login_allowance", "claim_referral_code", "shopbook_sync_collections"]));
    const plans = (await db.query<{ id: string; max_users: number }>("SELECT id, max_users FROM public.subscription_plans ORDER BY max_users")).rows;
    expect(plans.map((p) => [p.id, p.max_users])).toEqual([["basic", 2], ["growth", 12], ["business", 24]]);
  }, 120_000);
  it("changes nothing when run twice (the second run stops and rolls back)", async () => {
    const db = await live();
    await db.exec(script());
    await expect(db.exec(script())).rejects.toThrow();
    await db.exec("ROLLBACK").catch(() => undefined);
    expect((await db.query("SELECT 1 FROM public.subscription_plans")).rows).toHaveLength(3);
  }, 120_000);
  it("the read-only check runs before and after, and says what is missing", async () => {
    const db = await live();
    await db.exec("CREATE TABLE auth.users (id uuid PRIMARY KEY)");
    const check = readFileSync(resolve("drizzle/proposed/CHECK-2026-11-25-what-is-in-the-database.sql"), "utf8");
    const before = (await db.query<{ kind: string; name: string; rows: string }>(check)).rows;
    expect(before.find((r) => r.name === "owner_accounts")?.rows).toBe("missing");
    await db.exec(script());
    const after = (await db.query<{ kind: string; name: string; rows: string }>(check)).rows;
    expect(after.find((r) => r.kind === "needed" && r.name === "owner_accounts")?.rows).toBe("present");
    expect(after.find((r) => r.name === "subscription_plans" && r.kind === "table")?.rows).toBe("3");
  }, 120_000);
});
