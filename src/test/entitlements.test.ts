// The final subscription rules on a real PostgreSQL engine (PGlite), plus the app's copy of the same numbers: one login total per plan.
// `auth` is a stand-in for Supabase's, so each query runs as the role and login a real request would have.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { PLANS, loginAllowance, type Account, type PlanId } from "@/lib/shopbook";

const SETUP = `
 CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
 CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
 CREATE TABLE auth.sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
 CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT jsonb_build_object('email', 'x@x.co', 'iat', 4000000000) $$;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('test.role', true) $$;
 GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;
 CREATE TABLE public.shopbook_shop_sync (user_id uuid PRIMARY KEY, revision bigint NOT NULL DEFAULT 0, device_id uuid, payload jsonb NOT NULL DEFAULT '{}', updated_at timestamptz NOT NULL DEFAULT now());
 GRANT ALL ON public.shopbook_shop_sync TO service_role;`;
const file = (n: string) => readFileSync(resolve("drizzle", n), "utf8");

let db: PGlite, seq = 0, phone = 700000000;
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const newUser = () => uuid(++seq);
async function as<T = Record<string, unknown>>(user: string | null, sql: string, params: unknown[] = []) {
  await db.exec(`RESET ROLE; SELECT set_config('test.uid', '${user ?? ""}', false), set_config('test.role', '${user ? "authenticated" : "service_role"}', false); SET ROLE ${user ? "authenticated" : "service_role"};`);
  try { return (await db.query<T>(sql, params)).rows; } finally { await db.exec("RESET ROLE"); }
}
const one = async <T = Record<string, unknown>>(user: string | null, sql: string, params: unknown[] = []) => (await as<T>(user, sql, params))[0] as T;
type Acc = { user: string; account: string; business: string };
const setPlan = (o: Acc, plan: string) => as(null, "SELECT apply_verified_subscription($1, $2, 'monthly', now() + interval '30 days', $3)", [o.account, plan, `ref-${++seq}`]);
const newOwner = async (plan: string): Promise<Acc> => {
  const user = newUser(), r = await one<{ c: { account: string; business: string } }>(user, "SELECT connect_owner($1, 'Owner', $2, $1, 'KES') AS c", [`Shop ${user}`, `legacy-${user}`]);
  const o = { user, ...r.c };
  await setPlan(o, plan);
  return o;
};
const place = async (o: Acc, ref: string, kind = "shop") => (await one<{ id: string }>(o.user, "SELECT sync_location($1, $2, $3, $2, $4, true) AS id", [o.business, ref, `Place ${ref}`, kind])).id;
const login = (o: Acc, role: string, locations: string[] = []) => { const n = ++phone; return one<{ member_id: string; token: string }>(o.user, "SELECT * FROM create_login($1, $2, 'Worker', $3, NULL, NULL, $4, $5::uuid[], $6::uuid[])", [o.account, `ref-${n}`, `0${n}`, role, [o.business], locations]); };
const usage = (o: Acc) => one<Record<string, number>>(o.user, "SELECT * FROM account_usage($1)", [o.account]);
const allowances = async (o: Acc) => (await one<{ a: { locationId: string; allowance: number; employees: number }[] }>(o.user, "SELECT account_entitlements($1) AS a", [o.account])).a;
const changeAccess = (o: Acc, member: string, role: string, locations: string[]) => as(o.user, "SELECT update_member_access($1, $2, $3::uuid[], $4::uuid[])", [member, role, [o.business], locations]);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SETUP);
  for (const n of ["migrations/0008_owner_accounts_entitlements_permissions.sql", "migrations/0009_people_and_access.sql", "proposed/0011_dynamic_user_allowance.sql", "proposed/0012_enforce_synced_location_limit.sql", "proposed/0016_flat_login_allowance.sql"]) await db.exec(file(n));
}, 60000);

describe("plans", () => {
  it("the database and the app hold the same allowances and prices", async () => {
    const rows = await as<{ id: string; max_locations: number; max_users: number | null; max_managers: number; monthly_usd: string; yearly_usd: string }>(null, "SELECT * FROM subscription_plans ORDER BY rank");
    expect(rows.map((r) => [r.id, r.max_locations, r.max_users, r.max_managers, Number(r.monthly_usd), Number(r.yearly_usd)]))
      .toEqual(PLANS.map((p) => [p.id, p.locations, p.maxUsers, loginAllowance({ plan: p.id }).managers, p.monthlyUsd, p.yearlyUsd]));
    expect(PLANS.map((p) => [p.id, p.locations, p.maxUsers])).toEqual([["basic", 1, 2], ["growth", 5, 12], ["business", 10, 24]]);
    expect(PLANS.map((p) => p.monthlyUsd)).toEqual([11, 22, 50]);
  });

  it("every plan has one fixed login total (2026-11-20: one free pool)", async () => {
    expect((await as<{ id: string }>(null, "SELECT id FROM subscription_plans WHERE max_users IS NULL ORDER BY id")).map((x) => x.id)).toEqual([]);
  });

  it.each([
    ["growth", Array(5).fill("shop") as string[], 12],
    ["growth", Array(5).fill("store") as string[], 12],
    ["growth", ["shop"], 12],
    ["business", Array(10).fill("shop") as string[], 24],
    ["business", Array(10).fill("store") as string[], 24],
    ["business", ["shop"], 24],
    ["basic", ["shop"], 2],
  ])("%s with %j allows %i logins, on the server and in the app, whatever the locations", async (plan, kinds, total) => {
    const o = await newOwner(plan as string);
    let n = 0;
    const ids = [] as string[];
    for (const k of kinds as string[]) ids.push(await place(o, `p${++n}`, k));
    const managerCount = plan === "business" ? 3 : plan === "growth" ? 1 : 0;
    for (let i = 0; i < managerCount; i++) await login(o, "manager", ids);
    expect(await usage(o)).toMatchObject({ max_users: total, active_users: 1 + managerCount, available_users: (total as number) - 1 - managerCount });
    const shops = (kinds as string[]).filter((k) => k === "shop").length;
    const stores = (kinds as string[]).length - shops;
    expect(loginAllowance({ plan: plan as PlanId } as Account, { shops, stores, warehouses: 0 }, 3).total).toBe(total);
  }, 60000);
});

describe("Basic", () => {
  it("one location, one employee, no manager", async () => {
    const o = await newOwner("basic"), shop = await place(o, "only");
    await expect(place(o, "second", "store")).rejects.toThrow(/LOCATION_TYPE_LIMIT|LOCATION_LIMIT/);
    await expect(login(o, "manager", [shop])).rejects.toThrow(/MANAGER_LIMIT/);
    await expect(login(o, "admin", [shop])).rejects.toThrow(/MANAGER_LIMIT/);
    await login(o, "shopkeeper", [shop]);
    await expect(login(o, "staff", [shop])).rejects.toThrow(/ROLE_LIMIT/);
    expect(await usage(o)).toMatchObject({ max_users: 2, active_users: 2, available_users: 0 });
  });

  it("an older account still on two locations stays at two logins, keeps both locations and can't add", async () => {
    const o = await newOwner("growth");
    const a = await place(o, "a"), b = await place(o, "b");
    await setPlan(o, "basic");
    expect(await usage(o)).toMatchObject({ max_users: 2, employee_slots: 1, excess_locations: 1, active_locations: 2 });
    await login(o, "shopkeeper", [a]);
    await expect(login(o, "shopkeeper", [b])).rejects.toThrow(/USER_LIMIT/);
  });
});

describe("Growth and Business", () => {
  it("Business: the owner, 3 managers and 20 staff, all at one shop if the owner wants", async () => {
    const o = await newOwner("business"), shop = await place(o, "one"), other = await place(o, "two");
    for (let i = 0; i < 3; i++) await login(o, "manager", [shop]);
    await expect(login(o, "manager", [shop])).rejects.toThrow(/MANAGER_LIMIT/);
    for (let i = 0; i < 20; i++) await login(o, "shopkeeper", [shop]);
    expect(await usage(o)).toMatchObject({ max_users: 24, active_users: 24, active_managers: 3, available_users: 0 });
    await expect(login(o, "shopkeeper", [other])).rejects.toThrow(/USER_LIMIT/);
  }, 60000);

  it("Business: 20 staff at most even with no managers; empty manager places never become staff places", async () => {
    const o = await newOwner("business"), shop = await place(o, "one");
    for (let i = 0; i < 20; i++) await login(o, "shopkeeper", [shop]);
    expect(await usage(o)).toMatchObject({ max_users: 24, active_users: 21, employee_slots: 20, active_employees: 20 });
    await expect(login(o, "shopkeeper", [shop])).rejects.toThrow(/USER_LIMIT: your plan allows 20 staff/);
    await login(o, "manager", [shop]); // the manager places are still free
  }, 60000);

  it("Growth: staff shared between shops and warehouses as the owner likes; shopkeepers stay at shops", async () => {
    const o = await newOwner("growth"), a = await place(o, "a"), b = await place(o, "b"), w = await place(o, "w", "store");
    await login(o, "manager", [a, b, w]);
    for (let i = 0; i < 6; i++) await login(o, "shopkeeper", [a]);
    await login(o, "shopkeeper", [b]);
    for (let i = 0; i < 3; i++) await login(o, "warehouse_staff", [w]);
    expect(await usage(o)).toMatchObject({ max_users: 12, active_users: 12, available_users: 0 });
    await expect(login(o, "shopkeeper", [b])).rejects.toThrow(/USER_LIMIT/);
    await expect(login(o, "shopkeeper", [w])).rejects.toThrow(/LOCATION_ROLE/);
  }, 60000);

  it("a person on several locations is one login, and connections use no extra location", async () => {
    const o = await newOwner("business"), a = await place(o, "a", "store"), b = await place(o, "b", "store"), c = await place(o, "c");
    await login(o, "warehouse_staff", [a, b]);
    await login(o, "manager", [a, b, c]);
    expect(await usage(o)).toMatchObject({ active_users: 3, max_users: 24, active_locations: 3, available_locations: 7 });
    // No location has its own limit: each may hold the plan's whole staff allowance (20 on Business).
    expect((await allowances(o)).map((x) => x.allowance)).toEqual([20, 20, 20]);
  });

  it("moving or promoting someone already seated is never refused; a new login over the total is", async () => {
    const o = await newOwner("basic"), shop = await place(o, "s");
    const first = await login(o, "shopkeeper", [shop]);
    await changeAccess(o, first.member_id, "shopkeeper", [shop]);
    await expect(login(o, "shopkeeper", [shop])).rejects.toThrow(/USER_LIMIT/);
    const g = await newOwner("growth"), gs = await place(g, "s");
    const p = await login(g, "shopkeeper", [gs]);
    await changeAccess(g, p.member_id, "manager", [gs]);
    await changeAccess(g, p.member_id, "shopkeeper", [gs]);
  });

  it("bringing a removed login back needs a free place", async () => {
    const o = await newOwner("basic"), shop = await place(o, "s");
    const gone = await login(o, "shopkeeper", [shop]);
    await as(o.user, "SELECT revoke_member($1)", [gone.member_id]);
    await login(o, "shopkeeper", [shop]);
    await expect(as(o.user, "SELECT * FROM new_invitation($1)", [gone.member_id])).rejects.toThrow(/USER_LIMIT|LOCATION_USER_LIMIT/);
  });

  it("nobody but the owner reads the allowance list", async () => {
    const o = await newOwner("growth"), other = await newOwner("growth");
    await expect(as(other.user, "SELECT account_entitlements($1)", [o.account])).rejects.toThrow(/Only the owner/);
    await expect(as(o.user, "SELECT check_login_allowance($1, NULL, 'staff', '{}')", [o.account])).rejects.toThrow(/permission denied/);
    await expect(as(o.user, "SELECT * FROM location_allowances($1)", [o.account])).rejects.toThrow(/permission denied/);
  });
});

describe("changing a location's type", () => {
  it("is recorded and changes no login allowance", async () => {
    const o = await newOwner("growth"), id = await place(o, "x");
    await login(o, "shopkeeper", [id]); await login(o, "shopkeeper", [id]);
    expect(await usage(o)).toMatchObject({ max_users: 12, active_users: 3 });
    await place(o, "x", "warehouse");
    expect(await usage(o)).toMatchObject({ warehouses: 1, shops: 0, max_users: 12, active_users: 3, excess_users: 0 });
    const log = await as<{ before_value: unknown; after_value: unknown }>(o.user, "SELECT before_value, after_value FROM audit_logs WHERE action = 'LOCATION TYPE CHANGED'");
    expect(log).toEqual([{ before_value: { kind: "shop" }, after_value: { kind: "warehouse" } }]);
  });
});

describe("the synced location list", () => {
  const rows = (n: number) => ({ locations: Array.from({ length: n }, (_, i) => ({ id: `l${i}`, name: `L${i}` })) });
  // The real sync writes by upsert, which is what this must work under.
  const write = (user: string, payload: unknown) => as(null, "INSERT INTO shopbook_shop_sync (user_id, payload) VALUES ($1, $2) ON CONFLICT (user_id) DO UPDATE SET payload = excluded.payload", [user, payload]);

  it("can't grow past the plan, the built-in main location included", async () => {
    const o = await newOwner("growth");
    await write(o.user, rows(4));
    await expect(write(o.user, rows(5))).rejects.toThrow(/LOCATION_LIMIT.*5.*6/);
    expect((await one<{ p: { locations: unknown[] } }>(null, "SELECT payload AS p FROM shopbook_shop_sync WHERE user_id = $1", [o.user])).p.locations).toHaveLength(4);
  });

  it("an account already over after a downgrade keeps syncing; archived ones don't count", async () => {
    const o = await newOwner("business");
    await write(o.user, rows(7));
    await setPlan(o, "basic");
    await write(o.user, { ...rows(7), products: [{ id: "p1" }] });
    await write(o.user, rows(6));
    await expect(write(o.user, rows(7))).rejects.toThrow(/LOCATION_LIMIT/);
    await write(o.user, { locations: [...rows(6).locations, { id: "gone", name: "Gone", active: false }] });
  });

  it("an owner with no account yet has the trial's allowance", async () => {
    const stranger = newUser();
    await write(stranger, rows(9));
    await expect(write(stranger, rows(10))).rejects.toThrow(/LOCATION_LIMIT/);
  });
});
