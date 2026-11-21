import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { proposedFile, applyChain } from "./migration-chain";

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
let db: PGlite;
async function as<T = Record<string, unknown>>(user: string | null, sql: string, args: unknown[] = []) {
  await db.exec(`RESET ROLE; SELECT set_config('test.uid', '${user ?? ""}', false), set_config('test.email', '${user ? `${user}@example.test` : ""}', false), set_config('test.role', 'authenticated', false); SET ROLE authenticated`);
  try { return (await db.query<T>(sql, args)).rows; } finally { await db.exec("RESET ROLE"); }
}

beforeEach(async () => {
  db = new PGlite();
  await applyChain(db);
  await db.exec("CREATE TABLE auth.users(id uuid PRIMARY KEY, email text, email_confirmed_at timestamptz)");
  await db.exec(proposedFile("0018_unified_owner_identity"));
});
afterEach(async () => { await db.close(); });

describe("proposed owner identity migration", () => {
  it("requires a verified central identity and explicit owner confirmation", async () => {
    const owner = uid(31);
    await db.query("INSERT INTO auth.users VALUES ($1, 'owner@example.test', NULL)", [owner]);
    await expect(as(owner, "SELECT reconcile_legacy_owner('legacy-31', 'Shop', 'KES', NULL, true)")).rejects.toThrow(/CENTRAL_IDENTITY_UNVERIFIED/);
    await db.query("UPDATE auth.users SET email_confirmed_at = now() WHERE id = $1", [owner]);
    await expect(as(owner, "SELECT reconcile_legacy_owner('legacy-31', 'Shop', 'KES', NULL, false)")).rejects.toThrow(/OWNER_CONFIRMATION_REQUIRED/);
  });
  it("completes a migration idempotently without duplicating the owner or business", async () => {
    const owner = uid(32);
    await db.query("INSERT INTO auth.users VALUES ($1, 'owner@example.test', now())", [owner]);
    const once = (await as<{ reconcile_legacy_owner: { account: string; business: string; status: string } }>(owner, "SELECT reconcile_legacy_owner('legacy-32', 'Shop 32', 'KES', 'KE', true)"))[0]!.reconcile_legacy_owner;
    const twice = (await as<{ reconcile_legacy_owner: { account: string; business: string; status: string } }>(owner, "SELECT reconcile_legacy_owner('legacy-32', 'Shop 32', 'KES', 'KE', true)"))[0]!.reconcile_legacy_owner;
    expect(once.status).toBe("complete");
    expect(twice).toMatchObject({ status: "complete", account: once.account, business: once.business });
    expect((await db.query<{ n: number }>("SELECT count(*)::int n FROM owner_accounts WHERE owner_user_id = $1", [owner])).rows[0]?.n).toBe(1);
    expect((await db.query<{ n: number }>("SELECT count(*)::int n FROM businesses WHERE legacy_business_id = 'legacy-32'")).rows[0]?.n).toBe(1);
    expect((await as<{ status: string }>(owner, "SELECT owner_migration_status('legacy-32')->>'status' status"))[0]?.status).toBe("complete");
  });
  it("resumes a pending migration after interruption", async () => {
    const owner = uid(36);
    await db.query("INSERT INTO auth.users VALUES ($1, 'owner@example.test', now())", [owner]);
    await db.query("INSERT INTO legacy_owner_migrations(legacy_business_id, owner_user_id, status) VALUES ('legacy-resume', $1, 'pending')", [owner]);
    const resumed = (await as<{ reconcile_legacy_owner: { status: string; account: string; business: string } }>(owner, "SELECT reconcile_legacy_owner('legacy-resume', 'Resumed shop', 'KES', NULL, true)"))[0]!.reconcile_legacy_owner;
    expect(resumed.status).toBe("complete");
    expect((await db.query<{ status: string }>("SELECT status FROM legacy_owner_migrations WHERE legacy_business_id = 'legacy-resume'")).rows[0]?.status).toBe("complete");
    expect((await as<{ reconcile_legacy_owner: { account: string; business: string } }>(owner, "SELECT reconcile_legacy_owner('legacy-resume', 'Resumed shop', 'KES', NULL, true)"))[0]?.reconcile_legacy_owner).toMatchObject({ account: resumed.account, business: resumed.business });
  });
  it("sends an ambiguous legacy business to manual reconciliation without transferring ownership", async () => {
    const first = uid(33), second = uid(34);
    await db.query("INSERT INTO auth.users VALUES ($1, 'first@example.test', now()), ($2, 'second@example.test', now())", [first, second]);
    const created = (await as<{ reconcile_legacy_owner: { account: string } }>(first, "SELECT reconcile_legacy_owner('shared-legacy', 'First shop', 'KES', NULL, true)"))[0]!.reconcile_legacy_owner;
    const result = (await as<{ reconcile_legacy_owner: { status: string; reason: string } }>(second, "SELECT reconcile_legacy_owner('shared-legacy', 'Other shop', 'KES', NULL, true)"))[0]!.reconcile_legacy_owner;
    expect(result).toMatchObject({ status: "manual_reconciliation", reason: "LEGACY_ACCOUNT_ALREADY_CLAIMED" });
    expect((await db.query<{ owner_user_id: string }>("SELECT owner_user_id FROM legacy_owner_migrations WHERE legacy_business_id = 'shared-legacy'")).rows[0]?.owner_user_id).toBe(first);
    expect((await db.query<{ id: string }>("SELECT id FROM owner_accounts WHERE owner_user_id = $1", [first])).rows[0]?.id).toBe(created.account);
  });
  it("rollback removes migration metadata and leaves account and business rows intact", async () => {
    const owner = uid(35);
    await db.query("INSERT INTO auth.users VALUES ($1, 'owner@example.test', now())", [owner]);
    await as(owner, "SELECT reconcile_legacy_owner('legacy-35', 'Preserved shop', 'KES', NULL, true)");
    const rollback = (await import("./migration-chain")).rollbackFile("0018_unified_owner_identity");
    await db.exec(rollback);
    expect((await db.query<{ n: number }>("SELECT count(*)::int n FROM owner_accounts WHERE owner_user_id = $1", [owner])).rows[0]?.n).toBe(1);
    expect((await db.query<{ n: number }>("SELECT count(*)::int n FROM businesses WHERE legacy_business_id = 'legacy-35'")).rows[0]?.n).toBe(1);
    expect((await db.query<{ name: string | null }>("SELECT to_regclass('public.legacy_owner_migrations') name")).rows[0]?.name).toBeNull();
  });
});
