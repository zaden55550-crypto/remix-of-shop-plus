// The go-live bundle (drizzle/proposed/APPLY-2026-11-22.sql): every proposed migration except 0014 (trial read-only, which waits for
// server-side payment checks) and 0018 (separate approval). Rehearsed on PGlite after the journal, like migration-rehearsal.test.ts.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { BASE, JOURNAL, journalFile } from "./migration-chain";

describe("the go-live bundle", () => {
  it("applies after the journal with no errors and lists the trade documents", async () => {
    const db = new PGlite();
    await db.exec(BASE);
    for (const f of JOURNAL) await db.exec(journalFile(f));
    await db.exec(`CREATE SCHEMA storage; GRANT USAGE ON SCHEMA storage TO authenticated;
      CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean);
      CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text);
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY; GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
      CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
      GRANT EXECUTE ON FUNCTION storage.foldername(text) TO authenticated;`);
    await db.exec(readFileSync(resolve("drizzle/proposed/APPLY-2026-11-22.sql"), "utf8"));
    const r = await db.query<{ l: string[] }>("SELECT public.shopbook_sync_collections() l");
    expect(r.rows[0]!.l).toEqual(expect.arrayContaining(["laybys", "quotations", "prescriptions"]));
    const trial = await db.query("SELECT 1 FROM pg_proc WHERE proname = 'subscription_allows_writes'");
    expect(trial.rows).toHaveLength(0);
    expect((await db.query("SELECT id FROM storage.buckets")).rows).toEqual([{ id: "business-documents" }]);
  }, 60_000);
});

describe("proposed 0022: online copies of business documents", () => {
  it("lets each owner use only their own folder", async () => {
    const db = new PGlite();
    await db.exec(BASE);
    // A stand-in for the platform's storage tables (the real ones belong to the storage service).
    await db.exec(`CREATE SCHEMA storage; GRANT USAGE ON SCHEMA storage TO authenticated;
      CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean);
      CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text);
      ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY; GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO authenticated;
      CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
      GRANT EXECUTE ON FUNCTION storage.foldername(text) TO authenticated;`);
    await db.exec(readFileSync(resolve("drizzle/proposed/0022_business_documents_storage.sql"), "utf8"));
    expect((await db.query("SELECT public FROM storage.buckets WHERE id = 'business-documents'")).rows).toEqual([{ public: false }]);
    const a = "00000000-0000-4000-8000-00000000000a", b = "00000000-0000-4000-8000-00000000000b";
    const as = async (user: string, sql: string) => { await db.exec(`RESET ROLE; SELECT set_config('test.uid', '${user}', false); SET ROLE authenticated`); try { return (await db.query(sql)).rows; } finally { await db.exec("RESET ROLE"); } };
    await as(a, `INSERT INTO storage.objects (bucket_id, name) VALUES ('business-documents', '${a}/d1__KRA.pdf')`);
    await expect(as(a, `INSERT INTO storage.objects (bucket_id, name) VALUES ('business-documents', '${b}/d2__x.pdf')`)).rejects.toThrow();
    expect(await as(b, "SELECT name FROM storage.objects")).toEqual([]);
    expect(await as(a, "SELECT name FROM storage.objects")).toEqual([{ name: `${a}/d1__KRA.pdf` }]);
    await db.exec(readFileSync(resolve("drizzle/proposed/rollback/0022_business_documents_storage.down.sql"), "utf8"));
  }, 60_000);
});

describe("proposed 0023: each business's own connections and the online shop link", () => {
  it("keeps keys away from the browser, lists what is set, and publishes only a product list", async () => {
    const db = new PGlite();
    await db.exec(BASE);
    for (const f of JOURNAL) await db.exec(journalFile(f));
    await db.exec(readFileSync(resolve("drizzle/proposed/0023_business_integrations.sql"), "utf8"));
    const a = "00000000-0000-4000-8000-00000000000a";
    const as = async (user: string, sql: string, role = "authenticated") => { await db.exec(`RESET ROLE; SELECT set_config('test.uid', '${user}', false); SET ROLE ${role}`); try { return (await db.query(sql)).rows; } finally { await db.exec("RESET ROLE"); } };
    await expect(as(a, `SELECT save_business_integration('mpesa', '{"shortcode":"174379","passkey":"secret"}'::jsonb, true, false)`)).rejects.toThrow(/Accept the terms/);
    await as(a, `SELECT save_business_integration('mpesa', '{"shortcode":"174379","passkey":"secret"}'::jsonb, true, true)`);
    await as(a, `SELECT save_business_integration('mpesa', '{"shortcode":"600000","passkey":""}'::jsonb, true, true)`);
    expect(await as(a, "SELECT kind, fields FROM business_integration_status()")).toEqual([{ kind: "mpesa", fields: ["passkey", "shortcode"] }]);
    await expect(as(a, "SELECT config FROM business_integrations")).rejects.toThrow();
    expect((await db.query<{ c: { passkey: string; shortcode: string } }>("SELECT config c FROM business_integrations")).rows[0]!.c).toEqual({ passkey: "secret", shortcode: "600000" });
    await db.exec(`INSERT INTO shopbook_shop_sync (user_id, payload) VALUES ('${a}', '{"products":[{"id":"p1","name":"Sugar","sell":180,"qty":4,"buy":150,"createdAt":1},{"id":"p2","name":"Old","sell":1,"qty":0,"buy":1,"archived":true,"createdAt":1}],"movements":[{"id":"m1","at":1,"type":"OPENING","productId":"p1","qty":4,"prev":0,"next":4,"user":"A"}]}')`);
    await as(a, "SELECT set_public_shop('kifaru-shop', 'Kifaru Shop', '254722000000', true)");
    const page = (await as("", "SELECT public_shop_catalog('Kifaru-Shop') p", "anon"))[0] as { p: { title: string; products: unknown[] } };
    expect(page.p).toEqual({ title: "Kifaru Shop", whatsapp: "254722000000", products: [{ name: "Sugar", price: 180, unit: null, inStock: true }] });
    await db.exec(readFileSync(resolve("drizzle/proposed/rollback/0023_business_integrations.down.sql"), "utf8"));
  }, 60_000);
});

describe("proposed 0024: plan payments", () => {
  it("lets an owner read only their own plan payments and never write them", async () => {
    const db = new PGlite();
    await db.exec(BASE);
    for (const f of JOURNAL) await db.exec(journalFile(f));
    await db.exec(readFileSync(resolve("drizzle/proposed/0024_plan_payments.sql"), "utf8"));
    const a = "00000000-0000-4000-8000-00000000000a", b = "00000000-0000-4000-8000-00000000000b";
    const as = async (user: string, sql: string) => { await db.exec(`RESET ROLE; SELECT set_config('test.uid', '${user}', false); SET ROLE authenticated`); try { return (await db.query(sql)).rows; } finally { await db.exec("RESET ROLE"); } };
    await db.exec(`INSERT INTO plan_payments (owner_id, plan_id, billing, amount_kes, phone, checkout_request_id) VALUES ('${a}', 'growth', 'monthly', 2838, '254722000000', 'ws_CO_1'), ('${b}', 'basic', 'monthly', 1419, '254711000000', 'ws_CO_2')`);
    expect(await as(a, "SELECT checkout_request_id FROM plan_payments")).toEqual([{ checkout_request_id: "ws_CO_1" }]);
    await expect(as(a, "UPDATE plan_payments SET status = 'paid'")).rejects.toThrow();
    await expect(as(a, `INSERT INTO plan_payments (owner_id, plan_id, billing, amount_kes, phone, checkout_request_id) VALUES ('${a}', 'business', 'monthly', 1, '2547', 'x')`)).rejects.toThrow();
    await expect(db.exec(`INSERT INTO plan_payments (owner_id, plan_id, billing, amount_kes, phone, checkout_request_id) VALUES ('${a}', 'gold', 'monthly', 5, '2547', 'y')`)).rejects.toThrow();
    await db.exec(readFileSync(resolve("drizzle/proposed/rollback/0024_plan_payments.down.sql"), "utf8"));
  }, 60_000);
});

describe("APPLY-2026-11-23-additions: bringing an earlier run up to date", () => {
  it("adds the new providers and plan payments over the earlier 0023, and can run twice", async () => {
    const db = new PGlite();
    await db.exec(BASE);
    for (const f of JOURNAL) await db.exec(journalFile(f));
    // What an owner who ran the 2026-11-22 bundle before 2026-11-23 has: 0023 with four kinds only.
    await db.exec(readFileSync(resolve("src/test/fixtures-0023-before-providers.sql"), "utf8"));
    const a = "00000000-0000-4000-8000-00000000000a";
    const as = async (sql: string) => { await db.exec(`RESET ROLE; SELECT set_config('test.uid', '${a}', false); SET ROLE authenticated`); try { return (await db.query(sql)).rows; } finally { await db.exec("RESET ROLE"); } };
    await expect(as(`SELECT save_business_integration('airtel', '{"clientId":"x"}'::jsonb, true, true)`)).rejects.toThrow(/Unknown connection/);
    const add = readFileSync(resolve("drizzle/proposed/APPLY-2026-11-23-additions.sql"), "utf8");
    await db.exec(add);
    await db.exec(add);
    await as(`SELECT save_business_integration('airtel', '{"clientId":"x"}'::jsonb, true, true)`);
    await as(`SELECT save_business_integration('evc', '{"merchantUid":"m"}'::jsonb, true, true)`);
    expect((await as("SELECT kind FROM business_integration_status() ORDER BY kind")).map((r) => (r as { kind: string }).kind)).toEqual(["airtel", "evc"]);
    await db.exec(`INSERT INTO plan_payments (owner_id, plan_id, billing, amount_kes, phone, checkout_request_id) VALUES ('${a}', 'growth', 'monthly', 2838, '254722000000', 'ws_CO_9')`);
    expect(await as("SELECT checkout_request_id FROM plan_payments")).toEqual([{ checkout_request_id: "ws_CO_9" }]);
    expect(((await as("SELECT my_referral_code() r"))[0] as { r: { code: string } }).r.code).toMatch(/^[A-Z0-9]{6}$/);
  }, 60_000);
});

describe("proposed 0025: referrals", () => {
  it("gives each owner one code, records a referral once, and never lets an owner refer themselves", async () => {
    const db = new PGlite();
    await db.exec(BASE);
    for (const f of JOURNAL) await db.exec(journalFile(f));
    await db.exec(readFileSync(resolve("drizzle/proposed/0024_plan_payments.sql"), "utf8"));
    await db.exec(readFileSync(resolve("drizzle/proposed/0025_referrals.sql"), "utf8"));
    const a = "00000000-0000-4000-8000-00000000000a", b = "00000000-0000-4000-8000-00000000000b", c = "00000000-0000-4000-8000-00000000000c";
    const as = async (user: string, sql: string) => { await db.exec(`RESET ROLE; SELECT set_config('test.uid', '${user}', false); SET ROLE authenticated`); try { return (await db.query(sql)).rows; } finally { await db.exec("RESET ROLE"); } };
    const mine = (await as(a, "SELECT my_referral_code() r"))[0] as { r: { code: string; joined: number; paid: number } };
    expect(mine.r.code).toMatch(/^[A-Z0-9]{6}$/);
    expect(((await as(a, "SELECT my_referral_code() r"))[0] as { r: { code: string } }).r.code).toBe(mine.r.code);
    expect(((await as(a, `SELECT record_referral('${mine.r.code}') ok`))[0] as { ok: boolean }).ok).toBe(false);
    expect(((await as(b, `SELECT record_referral('${mine.r.code.toLowerCase()}') ok`))[0] as { ok: boolean }).ok).toBe(true);
    await as(b, `SELECT record_referral('${mine.r.code}')`);
    await as(c, `SELECT record_referral('${mine.r.code}')`);
    await db.exec(`INSERT INTO plan_payments (owner_id, plan_id, billing, amount_kes, phone, checkout_request_id, status) VALUES ('${b}', 'basic', 'monthly', 1419, '2547', 'ws_1', 'paid')`);
    expect(((await as(a, "SELECT my_referral_code() r"))[0] as { r: { joined: number; paid: number } }).r).toMatchObject({ joined: 2, paid: 1 });
    await expect(as(a, "SELECT * FROM referrals")).rejects.toThrow();
    await db.exec(readFileSync(resolve("drizzle/proposed/rollback/0025_referrals.down.sql"), "utf8"));
  }, 60_000);
});

describe("WIPE-2026-11-23-fresh-start: a brand new system", () => {
  it("empties every data table, the documents bucket and every online account, and keeps the reference lists", async () => {
    const db = new PGlite();
    await db.exec(BASE);
    for (const f of JOURNAL) await db.exec(journalFile(f));
    await db.exec(`CREATE SCHEMA storage; CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean);
      CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text);
      CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$ SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
      CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);`);
    await db.exec(readFileSync(resolve("drizzle/proposed/APPLY-2026-11-22.sql"), "utf8"));
    const a = "00000000-0000-4000-8000-00000000000a";
    await db.exec(`INSERT INTO auth.users VALUES ('${a}', 'owner@example.com');
      INSERT INTO public.shopbook_shop_sync (user_id, payload) VALUES ('${a}', '{}');
      INSERT INTO public.user_roles (user_id, role) VALUES ('${a}', 'support');
      INSERT INTO public.public_shops (owner_id, slug, title) VALUES ('${a}', 'test-shop', 'Test');
      INSERT INTO public.plan_payments (owner_id, plan_id, billing, amount_kes, phone, checkout_request_id) VALUES ('${a}', 'basic', 'monthly', 1, '2547', 'ws_1');
      INSERT INTO storage.objects (bucket_id, name) VALUES ('business-documents', '${a}/kra.pdf'), ('other-bucket', 'keep.png');`);
    const keepBefore = await db.query<{ n: number }>("SELECT (SELECT count(*) FROM subscription_plans) + (SELECT count(*) FROM permissions) + (SELECT count(*) FROM role_permissions) + (SELECT count(*) FROM business_type_catalogue) AS n");
    expect(Number(keepBefore.rows[0]!.n)).toBeGreaterThan(0);
    await db.exec(readFileSync(resolve("drizzle/proposed/WIPE-2026-11-23-fresh-start.sql"), "utf8"));
    const tables = (await db.query<{ t: string }>("SELECT tablename t FROM pg_tables WHERE schemaname = 'public'")).rows.map((r) => r.t);
    const keep = ["subscription_plans", "permissions", "role_permissions", "business_type_catalogue"];
    for (const t of tables) {
      const n = Number((await db.query<{ n: number }>(`SELECT count(*) n FROM public."${t}"`)).rows[0]!.n);
      if (keep.includes(t)) expect(n, t).toBeGreaterThan(0); else expect(n, t).toBe(0);
    }
    expect((await db.query("SELECT * FROM auth.users")).rows).toEqual([]);
    expect((await db.query("SELECT name FROM storage.objects")).rows).toEqual([{ name: "keep.png" }]);
    // The append-only audit lock is switched back on.
    expect((await db.query<{ e: string }>("SELECT DISTINCT tgenabled e FROM pg_trigger WHERE tgrelid = 'public.audit_logs'::regclass AND NOT tgisinternal")).rows).toEqual([{ e: "O" }]);
  }, 60_000);
});
