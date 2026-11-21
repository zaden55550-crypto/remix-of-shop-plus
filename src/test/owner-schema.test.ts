// Migrations 0008 and 0009 on a real PostgreSQL engine (PGlite, in memory): shared allowances, employee seats, isolation and owner control.
// `auth` is a small stand-in for Supabase's, so each query runs as the role and login a real request would have.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { PLANS } from "@/lib/shopbook";

const SETUP = `
 CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
 CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
 CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT jsonb_build_object('email', current_setting('test.email', true), 'iat', 4000000000) $$;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('test.role', true) $$;
 GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;`;
const MIGRATION = readFileSync(resolve("drizzle/migrations/0008_owner_accounts_entitlements_permissions.sql"), "utf8") + readFileSync(resolve("drizzle/migrations/0009_people_and_access.sql"), "utf8") + readFileSync(resolve("drizzle/proposed/0011_dynamic_user_allowance.sql"), "utf8") + readFileSync(resolve("drizzle/proposed/0016_flat_login_allowance.sql"), "utf8");

let db: PGlite;
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const OWNER = uuid(1), OTHER_OWNER = uuid(2);
const emp = (n: number) => uuid(100 + n);
/** Runs one query as a signed-in person, on a clean session each time. */
async function as<T = Record<string, unknown>>(user: string | null, sql: string, params: unknown[] = [], email = `${user}@x.co`) {
  await db.exec(`RESET ROLE; SELECT set_config('test.uid', '${user ?? ""}', false), set_config('test.email', '${email}', false), set_config('test.role', '${user ? "authenticated" : "service_role"}', false); SET ROLE ${user ? "authenticated" : "service_role"};`);
  try { return (await db.query<T>(sql, params)).rows; } finally { await db.exec("RESET ROLE"); }
}
const one = async <T = Record<string, unknown>>(user: string | null, sql: string, params: unknown[] = [], email?: string) => (await as<T>(user, sql, params, email))[0] as T;
const newOwner = async (user = OWNER, name = "Owner") => (await one<{ id: string }>(user, "SELECT ensure_owner_account($1, 'Owner Person') AS id", [name])).id;
const business = async (acc: string, name: string, user = OWNER, currency = "KES") => (await one<{ id: string }>(user, "SELECT create_business($1, $2, $3) AS id", [acc, name, currency])).id;
const location = async (b: string, name: string, kind = "shop", user = OWNER) => (await one<{ id: string }>(user, "SELECT create_location($1, $2, $3, $4) AS id", [b, name, name.slice(0, 8), kind])).id;
const setPlan = (acc: string, plan: string, ref = `ref-${plan}-${Math.random()}`) => as(null, "SELECT apply_verified_subscription($1, $2, 'monthly', now() + interval '30 days', $3)", [acc, plan, ref]);
const usage = (acc: string, user = OWNER) => one<{ max_locations: number; active_locations: number; available_locations: number; excess_locations: number; max_users: number; active_users: number; available_users: number; excess_users: number; status: string; usable: boolean }>(user, "SELECT * FROM account_usage($1)", [acc]);
const firstBusiness = async (acc: string) => (await as<{ id: string }>(null, "SELECT id FROM businesses WHERE owner_account_id = $1 ORDER BY created_at LIMIT 1", [acc]))[0]?.id ?? await business(acc, "First");
/** Employee logins come from locations, so an account being given one needs at least one. */
const ensureShop = async (acc: string) => { if (!(await as(null, "SELECT id FROM locations WHERE owner_account_id = $1", [acc])).length) await location(await firstBusiness(acc), "First Shop"); };
const invite = async (acc: string, n: number, role = "shopkeeper", businesses: string[] = [], locations: string[] = [], by = OWNER) => {
  await ensureShop(acc);
  const assignedBusinesses = businesses.length ? businesses : [await firstBusiness(acc)];
  const assignedLocations = locations.length ? locations : (await as<{ id: string }>(by, "SELECT id FROM locations WHERE owner_account_id = $1 AND status = 'active' AND business_id = ANY($2::uuid[]) ORDER BY created_at LIMIT 1", [acc, assignedBusinesses])).map((l) => l.id);
  return one<{ member_id: string; token: string }>(by, "SELECT * FROM create_login($1, $2, 'Worker', NULL, $3, NULL, $4, $5::uuid[], $6::uuid[])", [acc, `ref-${n}`, `${emp(n)}@x.co`, role, assignedBusinesses, assignedLocations]);
};
const accept = (user: string | null, token: string, as_ = emp(1)) => as(null, "SELECT finish_invitation($1, $2)", [token, user ?? as_]);
const hire = async (acc: string, n: number, role = "shopkeeper", businesses: string[] = [], locations: string[] = []) => {
  const i = await invite(acc, n, role, businesses, locations);
  await accept(emp(n), i.token);
  return i.member_id;
};
const can = async (acc: string, user: string, key: string) => (await one<{ ok: boolean }>(user, "SELECT has_permission($1, $2) AS ok", [acc, key])).ok;

beforeEach(async () => {
  db = new PGlite();
  await db.exec(SETUP);
  await db.exec(MIGRATION);
}, 60000);

describe("plans in the database", () => {
  it("match the app's plan list exactly", async () => {
    const rows = await as<{ id: string; max_locations: number; max_users: number; monthly_usd: string }>(OWNER, "SELECT * FROM subscription_plans ORDER BY rank");
    expect(rows.map((r) => [r.id, r.max_locations, r.max_users, Number(r.monthly_usd)])).toEqual(PLANS.map((p) => [p.id, p.locations, p.maxUsers, p.monthlyUsd]));
    expect(rows.map((r) => [r.max_locations, r.max_users])).toEqual([[1, 2], [5, 12], [10, 24]]);
  });
});

describe("shared location allowance", () => {
  it("Growth: five locations across three businesses, and the sixth needs an upgrade", async () => {
    const acc = await newOwner();
    await setPlan(acc, "growth");
    const [a, b, c] = [await business(acc, "A"), await business(acc, "B", OWNER, "TZS"), await business(acc, "C", OWNER, "USD")];
    await location(a, "Shop 1"); await location(a, "Shop 2"); await location(b, "Shop 3"); await location(c, "Depot", "warehouse"); await location(c, "Back", "store");
    expect(await usage(acc)).toMatchObject({ max_locations: 5, active_locations: 5, available_locations: 0 });
    await expect(location(a, "Shop 6")).rejects.toThrow(/LOCATION_LIMIT.*5/);
    expect((await as(OWNER, "SELECT id FROM locations")).length).toBe(5);
  });

  it.each([["basic", 1], ["business", 10]])("%s stops at %i; Basic uses a Shop and Business accepts mixed locations", async (plan, max) => {
    const acc = await newOwner();
    await setPlan(acc, plan as string);
    const b = await business(acc, "A");
    for (let i = 0; i < (max as number); i++) await location(b, `L${i}`, plan === "basic" ? "shop" : i % 2 ? "shop" : "warehouse");
    await expect(location(b, "One more")).rejects.toThrow(/LOCATION_LIMIT/);
  });

  it("archiving frees a slot; reactivating needs one; a downgrade deletes nothing and blocks new ones", async () => {
    const acc = await newOwner();
    await setPlan(acc, "business");
    const b = await business(acc, "A");
    const ids = [];
    for (let i = 0; i < 7; i++) ids.push(await location(b, `L${i}`));
    await setPlan(acc, "growth");
    expect(await usage(acc)).toMatchObject({ max_locations: 5, active_locations: 7, excess_locations: 2, available_locations: 0 });
    await expect(location(b, "New")).rejects.toThrow(/LOCATION_LIMIT/);
    expect((await as(OWNER, "SELECT id FROM locations")).length).toBe(7);
    await as(OWNER, "SELECT set_location_status($1, 'archived')", [ids[0]]);
    await as(OWNER, "SELECT set_location_status($1, 'archived')", [ids[1]]);
    await as(OWNER, "SELECT set_location_status($1, 'archived')", [ids[2]]);
    await location(b, "New");
    await expect(as(OWNER, "SELECT set_location_status($1, 'active')", [ids[0]])).rejects.toThrow(/LOCATION_LIMIT/);
    expect((await as(OWNER, "SELECT id FROM locations")).length).toBe(8);
  });

  it("an ended trial or cancelled plan can't add locations, but keeps them", async () => {
    const acc = await newOwner();
    const b = await business(acc, "A");
    await location(b, "L1");
    await as(null, "UPDATE owner_subscriptions SET trial_ends_at = now() - interval '1 day' WHERE owner_account_id = $1", [acc]);
    await expect(location(b, "L2")).rejects.toThrow(/not active/);
    expect((await as(OWNER, "SELECT id FROM locations")).length).toBe(1);
  });
});

describe("user allowance", () => {
  it("Basic is the owner plus one", async () => {
    const acc = await newOwner();
    await setPlan(acc, "basic");
    await invite(acc, 1);
    await expect(invite(acc, 2)).rejects.toThrow(/USER_LIMIT/);
    expect(await usage(acc)).toMatchObject({ max_users: 2, active_users: 2, available_users: 0 });
  });

  it("revoking frees the seat and keeps the record; one person with many locations is one seat", async () => {
    const acc = await newOwner();
    await setPlan(acc, "growth");
    const b = await business(acc, "A"), l1 = await location(b, "L1"), l2 = await location(b, "L2");
    const m = await hire(acc, 1, "manager", [b], [l1, l2]);
    expect((await usage(acc)).active_users).toBe(2);
    await as(OWNER, "SELECT revoke_member($1)", [m]);
    expect((await usage(acc)).active_users).toBe(1);
    expect((await as(OWNER, "SELECT status FROM owner_members WHERE id = $1", [m]))[0]).toEqual({ status: "revoked" });
    expect(await as(emp(1), "SELECT id FROM locations")).toEqual([]);
  });
});

describe("isolation", () => {
  it("one owner can't see or use another's business", async () => {
    const acc = await newOwner(), b = await business(acc, "Mine");
    await location(b, "L1");
    const other = await newOwner(OTHER_OWNER, "Other");
    expect(await as(OTHER_OWNER, "SELECT id FROM businesses")).toEqual([]);
    expect(await as(OTHER_OWNER, "SELECT id FROM locations")).toEqual([]);
    expect(await as(OTHER_OWNER, "SELECT * FROM owner_subscriptions WHERE owner_account_id = $1", [acc])).toEqual([]);
    await expect(location(b, "Sneaky", "shop", OTHER_OWNER)).rejects.toThrow(/Not allowed/);
    await expect(as(OTHER_OWNER, "SELECT * FROM account_usage($1)", [acc])).rejects.toThrow(/Not allowed/);
    await expect(as(OTHER_OWNER, "SELECT create_business($1, 'X', 'KES')", [acc])).rejects.toThrow(/Only the owner/);
    await expect(invite(acc, 1, "staff", [b], [], OTHER_OWNER)).rejects.toThrow(/Not allowed/);
    await expect(as(OTHER_OWNER, "SELECT * FROM create_login($1, 'r', 'A', NULL, 'a@x.co', NULL, 'staff', $2::uuid[], '{}'::uuid[])", [other, [b]])).rejects.toThrow(/not available/);
  });

  it("a shopkeeper sees only their shop and business, with no way round it", async () => {
    const acc = await newOwner();
    await setPlan(acc, "growth");
    const a = await business(acc, "A"), b = await business(acc, "B"), s1 = await location(a, "Shop 1"), s2 = await location(a, "Shop 2"), s3 = await location(b, "Shop 3");
    await hire(acc, 1, "shopkeeper", [a], [s1]);
    expect(await as(emp(1), "SELECT id FROM locations")).toEqual([{ id: s1 }]);
    expect(await as(emp(1), "SELECT id FROM businesses")).toEqual([{ id: a }]);
    expect(await as(emp(1), "SELECT id FROM locations WHERE id = ANY($1::uuid[])", [[s2, s3]])).toEqual([]);
    await expect(as(emp(1), "SELECT * FROM owner_subscriptions")).resolves.toEqual([]);
    await expect(as(emp(1), "UPDATE locations SET status = 'archived'")).rejects.toThrow(/permission denied/);
    await expect(location(a, "Mine", "shop", emp(1))).rejects.toThrow(/Not allowed/);
    expect((await as(OWNER, "SELECT id FROM locations")).length).toBe(3);
  });

  it("nobody signed in can read anything", async () => {
    await newOwner();
    await db.exec("SET ROLE anon");
    await expect(db.query("SELECT * FROM owner_accounts")).rejects.toThrow(/permission denied/);
    await expect(db.query("SELECT * FROM subscription_plans")).rejects.toThrow(/permission denied/);
    await db.exec("RESET ROLE");
  });
});

describe("permissions", () => {
  it("a seller can't see buying prices or margins by default; the owner can grant and revoke each", async () => {
    const acc = await newOwner();
    await setPlan(acc, "growth");
    const m = await hire(acc, 1, "shopkeeper");
    expect(await can(acc, emp(1), "products.view_selling_price")).toBe(true);
    for (const k of ["products.view_buying_price", "products.view_cost", "profit.view_margin", "profit.view_business", "finance.reports", "finance.export", "salary.view"]) expect(await can(acc, emp(1), k)).toBe(false);
    await as(OWNER, "SELECT set_member_permission($1, 'products.view_buying_price', true)", [m]);
    expect(await can(acc, emp(1), "products.view_buying_price")).toBe(true);
    await as(OWNER, "SELECT set_member_permission($1, 'products.view_buying_price', false)", [m]);
    expect(await can(acc, emp(1), "products.view_buying_price")).toBe(false);
    await as(OWNER, "SELECT set_member_permission($1, 'pos.access', false)", [m]);
    expect(await can(acc, emp(1), "pos.access")).toBe(false);
    expect(await can(acc, OWNER, "products.view_buying_price")).toBe(true);
  });

  it("roles can't be used to climb: no self-granting, no owner-only powers, even for an admin", async () => {
    const acc = await newOwner();
    await setPlan(acc, "growth");
    const admin = await hire(acc, 1, "admin");
    await expect(as(emp(1), "SELECT set_member_permission($1, 'finance.export', true)", [admin])).rejects.toThrow(/Only the owner/);
    await expect(as(emp(1), "INSERT INTO member_permissions VALUES ($1, 'finance.export', true)", [admin])).rejects.toThrow(/permission denied/);
    await expect(as(emp(1), "UPDATE owner_members SET role = 'owner' WHERE id = $1", [admin])).rejects.toThrow(/permission denied/);
    for (const k of ["subscription.manage", "money_transfer.initiate", "money_transfer.approve", "business.transfer_ownership", "owner.grant"]) expect(await can(acc, emp(1), k)).toBe(false);
    await expect(as(OWNER, "SELECT set_member_permission($1, 'money_transfer.initiate', true)", [admin])).rejects.toThrow(/stays with the owner/);
    const b = await firstBusiness(acc);
    await expect(as(emp(1), "SELECT * FROM create_login($1, 'r', 'X', NULL, 'x@x.co', NULL, 'admin', $2::uuid[], '{}'::uuid[])", [acc, [b]])).rejects.toThrow(/Only the owner can invite an admin/);
    await expect(as(OWNER, "SELECT * FROM create_login($1, 'r', 'X', NULL, 'x@x.co', NULL, 'owner', $2::uuid[], '{}'::uuid[])", [acc, [b]])).rejects.toThrow(/valid role/);
  });

  it("a revoked person loses every permission", async () => {
    const acc = await newOwner();
    await setPlan(acc, "growth");
    const m = await hire(acc, 1, "admin");
    expect(await can(acc, emp(1), "stock.view")).toBe(true);
    await as(OWNER, "SELECT revoke_member($1)", [m]);
    expect(await can(acc, emp(1), "stock.view")).toBe(false);
  });
});

describe("invitations", () => {
  it("work once, only for the invited contact, and the token isn't stored", async () => {
    const acc = await newOwner();
    await setPlan(acc, "growth");
    const i = await invite(acc, 1);
    expect(i.token).toHaveLength(64);
    const stored = await as<{ token_hash: string }>(null, "SELECT token_hash FROM employee_invitations");
    expect(stored[0]?.token_hash).not.toBe(i.token);
    const check = async (contact: string) => (await as<{ r: { ok: boolean; reason?: string } }>(null, "SELECT verify_invitation($1, $2) AS r", [i.token, contact]))[0]?.r;
    expect(await check("someone@else.co")).toMatchObject({ ok: false, reason: "contact" });
    expect(await check(`${emp(1)}@X.CO`)).toMatchObject({ ok: true });
    await accept(emp(1), i.token);
    await expect(accept(emp(1), i.token)).rejects.toThrow(/not valid/);
    await expect(accept(emp(1), "made-up")).rejects.toThrow(/not valid/);
    await expect(as(emp(1), "SELECT finish_invitation($1, $2)", [i.token, emp(1)])).rejects.toThrow(/permission denied/);
    await expect(as(emp(1), "SELECT * FROM employee_invitations")).rejects.toThrow(/permission denied/);
  });

  it("an expired or revoked invitation does nothing", async () => {
    const acc = await newOwner();
    await setPlan(acc, "growth");
    const a = await invite(acc, 1), b = await invite(acc, 2);
    await as(null, "UPDATE employee_invitations SET expires_at = now() - interval '1 hour' WHERE member_id = $1", [a.member_id]);
    await expect(accept(emp(1), a.token)).rejects.toThrow(/not valid/);
    await as(OWNER, "SELECT revoke_member($1)", [b.member_id]);
    await expect(accept(emp(2), b.token)).rejects.toThrow(/not valid/);
  });

  it("a person with an active login can't also become an owner", async () => {
    const acc = await newOwner();
    await setPlan(acc, "growth");
    await hire(acc, 1);
    await expect(as(emp(1), "SELECT ensure_owner_account('Mine', 'Me')")).rejects.toThrow(/belongs to an employee/);
  });
});

describe("subscriptions can't be changed from a client", () => {
  it("no direct writes and no access to the verified function; a repeated callback does nothing", async () => {
    const acc = await newOwner();
    await expect(as(OWNER, "UPDATE owner_subscriptions SET plan_id = 'business', status = 'active'")).rejects.toThrow(/permission denied/);
    await expect(as(OWNER, "SELECT apply_verified_subscription($1, 'business', 'yearly', now(), 'fake')", [acc])).rejects.toThrow(/permission denied/);
    await expect(as(OWNER, "UPDATE subscription_plans SET max_locations = 99")).rejects.toThrow(/permission denied/);
    await setPlan(acc, "growth", "mpesa-1");
    await setPlan(acc, "business", "mpesa-1");
    expect((await usage(acc)).max_locations).toBe(5);
    expect((await as(null, "SELECT id FROM subscription_events")).length).toBe(1);
  });

  it("a new owner starts on the 30-day trial, and asking twice doesn't make a second account", async () => {
    const acc = await newOwner();
    expect(await newOwner()).toBe(acc);
    expect(await usage(acc)).toMatchObject({ status: "trial", usable: true, max_locations: 10, max_managers: 3, max_users: 24, active_users: 1 });
  });
});

describe("audit history", () => {
  it("records who did what, and nobody can change it, not even the owner or the server", async () => {
    const acc = await newOwner();
    await setPlan(acc, "growth");
    const m = await hire(acc, 1);
    await as(OWNER, "SELECT set_member_permission($1, 'pos.access', false)", [m]);
    const rows = await as<{ action: string; user_id: string }>(OWNER, "SELECT action, user_id FROM audit_logs ORDER BY at");
    expect(rows.map((r) => r.action)).toEqual(expect.arrayContaining(["OWNER ACCOUNT CREATED", "SUBSCRIPTION CHANGED", "LOGIN CREATED", "INVITATION ACCEPTED", "PERMISSION CHANGED"]));
    expect(rows.find((r) => r.action === "PERMISSION CHANGED")?.user_id).toBe(OWNER);
    expect(rows.find((r) => r.action === "INVITATION ACCEPTED")?.user_id).toBe(emp(1));
    await expect(as(OWNER, "DELETE FROM audit_logs")).rejects.toThrow(/permission denied/);
    await expect(as(OWNER, "UPDATE audit_logs SET action = 'X'")).rejects.toThrow(/permission denied/);
    await expect(as(null, "DELETE FROM audit_logs")).rejects.toThrow(/cannot be changed/);
    await expect(as(null, "UPDATE audit_logs SET action = 'X'")).rejects.toThrow(/cannot be changed/);
    expect(await as(emp(1), "SELECT id FROM audit_logs")).toEqual([]); // a shopkeeper can't read it by default
  });
});
