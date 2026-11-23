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
