// People & Access rules in the database itself (migration 0009 on a real PostgreSQL engine). `auth` is a stand-in for Supabase's.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

const SETUP = `
 CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
 CREATE SCHEMA auth; GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
 CREATE TABLE auth.sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('test.uid', true), '')::uuid $$;
 CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT jsonb_build_object('email', current_setting('test.email', true), 'iat', current_setting('test.iat', true)::bigint) $$;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('test.role', true) $$;
 GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;`;
const file = (n: string) => readFileSync(resolve("drizzle/migrations", n), "utf8");

let db: PGlite, seq = 0;
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const newUser = () => uuid(++seq);
const FUTURE = 4000000000;
async function as<T = Record<string, unknown>>(user: string | null, sql: string, params: unknown[] = [], iat = FUTURE) {
  await db.exec(`RESET ROLE; SELECT set_config('test.uid', '${user ?? ""}', false), set_config('test.email', 'x@x.co', false), set_config('test.iat', '${iat}', false), set_config('test.role', '${user ? "authenticated" : "service_role"}', false); SET ROLE ${user ? "authenticated" : "service_role"};`);
  try { return (await db.query<T>(sql, params)).rows; } finally { await db.exec("RESET ROLE"); }
}
const one = async <T = Record<string, unknown>>(user: string | null, sql: string, params: unknown[] = [], iat = FUTURE) => (await as<T>(user, sql, params, iat))[0] as T;
type Issued = { member_id: string; invitation_id: string; token: string };
type Acc = { user: string; account: string; business: string };
const newOwner = async (plan = "growth"): Promise<Acc> => {
  const user = newUser(), r = await one<{ c: { account: string; business: string } }>(user, "SELECT connect_owner($1, 'Owner', $2, $1, 'KES') AS c", [`Shop ${user}`, `legacy-${user}`]);
  await as(null, "SELECT apply_verified_subscription($1, $2, 'monthly', now() + interval '30 days', $3)", [r.c.account, plan, `ref-${user}`]);
  // Employee logins come from locations, so every account starts with a few shops: room for the logins these tests need.
  for (let i = 1; i <= ({ basic: 1, growth: 2, business: 3 } as Record<string, number>)[plan]!; i++) await as(user, "SELECT sync_location($1, $2, $3, $2, 'shop', true)", [r.c.business, `base-${i}`, `Base ${i}`]);
  return { user, ...r.c };
};
let phone = 700000000;
const login = async (o: Acc, opts: { role?: string; locations?: string[]; businesses?: string[]; email?: string | null; phone?: string | null; ref?: string } = {}) => {
  const n = ++phone;
  const role = opts.role ?? "shopkeeper", businesses = opts.businesses ?? [o.business];
  const plan = (await one<{ plan_id: string }>(o.user, "SELECT plan_id FROM owner_subscriptions WHERE owner_account_id = $1", [o.account])).plan_id;
  const places = await as<{ id: string; kind: string; used: number }>(o.user, `SELECT l.id, l.kind,
    (SELECT count(*)::int FROM member_locations ml JOIN owner_members m ON m.id = ml.member_id WHERE ml.location_id = l.id AND m.status IN ('active','invited','suspended') AND m.role = $3) used
    FROM locations l WHERE l.owner_account_id = $1 AND l.status = 'active' AND l.business_id = ANY($2::uuid[]) ORDER BY used, l.created_at`, [o.account, businesses, role]);
  const matches = (l: typeof places[number]) => role === "manager" || role === "admin" || (role === "shopkeeper" ? l.kind === "shop" : role === "warehouse_staff" ? l.kind !== "shop" : false);
  const limit = role === "shopkeeper" ? (plan === "basic" ? 1 : 2) : role === "warehouse_staff" ? 1 : Number.MAX_SAFE_INTEGER;
  const eligible = places.find((l) => matches(l) && l.used < limit) ?? places.find(matches);
  const locations = opts.locations ?? (eligible ? [eligible.id] : []);
  return one<Issued>(o.user, "SELECT * FROM create_login($1, $2, 'Worker', $3, $4, 'EMP-1', $5, $6::uuid[], $7::uuid[])", [o.account, opts.ref ?? `ref-${n}`, opts.phone === undefined ? `0${n}` : opts.phone, opts.email ?? null, role, businesses, locations]);
};
const hire = async (o: Acc, opts: Parameters<typeof login>[1] = {}) => { const i = await login(o, opts), user = newUser(); await as(null, "SELECT finish_invitation($1, $2)", [i.token, user]); return { ...i, user }; };
const place = async (o: Acc, ref: string, kind = "shop") => (await one<{ id: string }>(o.user, "SELECT sync_location($1, $2, $3, $4, $5, true) AS id", [o.business, ref, `Place ${ref}`, ref, kind])).id;
const usage = (o: Acc) => one<{ active_users: number; max_users: number; available_users: number; excess_users: number }>(o.user, "SELECT * FROM account_usage($1)", [o.account]);
const access = async (user: string, iat = FUTURE) => (await one<{ a: Record<string, unknown> }>(user, "SELECT my_access() AS a", [], iat)).a;
const can = async (o: Acc, user: string, key: string, iat = FUTURE) => (await one<{ ok: boolean }>(user, "SELECT has_permission($1, $2) AS ok", [o.account, key], iat)).ok;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(SETUP);
  await db.exec(file("0008_owner_accounts_entitlements_permissions.sql"));
  await db.exec(file("0009_people_and_access.sql"));
  await db.exec(readFileSync(resolve("drizzle/proposed/0011_dynamic_user_allowance.sql"), "utf8"));
  await db.exec(readFileSync(resolve("drizzle/proposed/0016_flat_login_allowance.sql"), "utf8"));
}, 60000);

describe("subscription user allowance", () => {
  // One pool of logins (2026-11-20): the managers, then every other login as staff at one shop, then nothing more.
  it.each([["basic", 1, 0, 1, 2], ["growth", 2, 1, 10, 12], ["business", 3, 3, 20, 24]])("%s: %i sites, %i managers and %i staff fill one pool of %i logins", async (plan, _sites, managers, employees, total) => {
    const o = await newOwner(plan as string);
    const locations = (await as<{ id: string }>(o.user, "SELECT id FROM locations WHERE owner_account_id = $1 ORDER BY created_at", [o.account])).map((l) => l.id);
    for (let i = 0; i < (managers as number); i++) await login(o, { role: "manager", locations: locations.slice(0, 1) });
    for (let i = 0; i < (employees as number); i++) await login(o, { role: "shopkeeper", locations: [locations[0]!] });
    expect(await usage(o)).toMatchObject({ max_users: total, active_employees: employees, available_users: 0, active_users: total });
    await expect(login(o, { role: "shopkeeper", locations: [locations[0]!] })).rejects.toThrow(/USER_LIMIT|LOCATION_USER_LIMIT/);
  }, 60000);

  it("counts one person once, across every business, however many locations they have", async () => {
    const o = await newOwner("growth");
    const second = (await one<{ id: string }>(o.user, "SELECT create_business($1, 'Second', 'TZS') AS id", [o.account])).id;
    const a = await place(o, "a"), b = await place(o, "b"), c = (await one<{ id: string }>(o.user, "SELECT sync_location($1, 'c', 'Other', 'c', 'warehouse', true) AS id", [second])).id;
    await hire(o, { role: "manager", businesses: [o.business, second], locations: [a, b, c] });
    expect((await usage(o)).active_users).toBe(2);
    await login(o, { role: "warehouse_staff", businesses: [second], locations: [c] });
    expect((await usage(o)).active_users).toBe(3);
  });

  it("an employee can't get two logins, and suspended logins still hold their place", async () => {
    const o = await newOwner("basic");
    const m = await hire(o, { ref: "same" });
    await expect(login(o, { ref: "same" })).rejects.toThrow(/already has a login/);
    await as(o.user, "SELECT suspend_member($1)", [m.member_id]);
    expect((await usage(o)).active_users).toBe(2);
    await expect(login(o)).rejects.toThrow(/USER_LIMIT/);
  });

  it("removing a login frees its place; a downgrade removes nobody", async () => {
    const o = await newOwner("business");
    const places = (await as<{ id: string }>(o.user, "SELECT id FROM locations WHERE owner_account_id = $1 ORDER BY created_at", [o.account])).map((x) => x.id);
    const made = []; for (let i = 0; i < 4; i++) made.push(await hire(o, { locations: [places[i % places.length]!] }));
    await as(null, "SELECT apply_verified_subscription($1, 'basic', 'monthly', now() + interval '30 days', $2)", [o.account, `down-${o.user}`]);
    expect(await usage(o)).toMatchObject({ max_users: 2, active_users: 5, excess_users: 3, excess_employees: 3 });
    expect(await access(made[0]!.user)).toMatchObject({ kind: "member" });
    await expect(login(o)).rejects.toThrow(/USER_LIMIT/);
    for (const m of made) await as(o.user, "SELECT revoke_member($1)", [m.member_id]);
    expect((await usage(o)).active_users).toBe(1);
    await login(o);
  }, 60000);

  it("two requests for the last place can't both win", async () => {
    const o = await newOwner("basic");
    const results = await Promise.allSettled([login(o), login(o)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await usage(o)).active_users).toBe(2);
  });
});

describe("login accounts", () => {
  it("a phone-only employee gets a private sign-in address; +254 and 0 are the same phone", async () => {
    const o = await newOwner();
    const i = await login(o, { phone: "+254 799 111 222" });
    const m = await one<{ login_email: string; phone_norm: string; email: string | null }>(null, "SELECT login_email, phone_norm, email FROM owner_members WHERE id = $1", [i.member_id]);
    expect(m).toMatchObject({ phone_norm: "799111222", email: null });
    expect(m.login_email).toMatch(/^phone-799111222-.+@users\.shopplus\.app$/);
    await expect(login(o, { phone: "0799111222" })).rejects.toThrow(/already uses/);
    await expect(login(o, { phone: null, email: null })).rejects.toThrow(/phone number or email/);
  });

  it("sign-in finds the login by phone or email; another person's details find nothing", async () => {
    const o = await newOwner();
    const m = await hire(o, { phone: "+254 788 000 111", email: "Jane@Shop.co" });
    const find = async (id: string) => (await one<{ r: Record<string, unknown> }>(null, "SELECT resolve_login($1) AS r", [id])).r;
    expect(await find("0788000111")).toMatchObject({ found: true, memberId: m.member_id, loginEmail: "jane@shop.co" });
    expect(await find(" JANE@shop.co ")).toMatchObject({ found: true, memberId: m.member_id });
    expect(await find("0700999888")).toMatchObject({ found: false });
    await expect(as(m.user, "SELECT resolve_login('x')")).rejects.toThrow(/permission denied/);
  });

  it("wrong attempts are counted, recorded for the owner, and invisible to anyone else", async () => {
    const o = await newOwner(), other = await newOwner();
    const m = await hire(o, { email: "count@shop.co" });
    for (let i = 0; i < 5; i++) await as(null, "SELECT record_login('count@shop.co', $1, $2, false, 'Wrong password', '1.2.3.4', 'ua')", [o.account, m.member_id]);
    expect((await one<{ r: { failures: number } }>(null, "SELECT resolve_login('count@shop.co') AS r")).r.failures).toBe(5);
    const view = (await one<{ p: { logins: { success: boolean; reason: string }[] } }>(o.user, "SELECT people_overview($1) AS p", [o.account])).p;
    expect(view.logins.filter((l) => !l.success)).toHaveLength(5);
    await expect(as(other.user, "SELECT people_overview($1)", [o.account])).rejects.toThrow(/Only the owner/);
    await expect(as(m.user, "SELECT * FROM login_events")).rejects.toThrow(/permission denied/);
  });
});

describe("invitations", () => {
  it("statuses are Pending, Accepted, Expired and Revoked; the hash never leaves the database", async () => {
    const o = await newOwner("business");
    const pending = await login(o), accepted = await hire(o), expired = await login(o), revoked = await login(o);
    await as(null, "UPDATE employee_invitations SET expires_at = now() - interval '1 minute' WHERE id = $1", [expired.invitation_id]);
    await as(o.user, "SELECT revoke_invitation($1)", [revoked.invitation_id]);
    const view = (await one<{ p: { invitations: { id: string; status: string }[] } }>(o.user, "SELECT people_overview($1) AS p", [o.account])).p;
    const statusOf = (id: string) => view.invitations.find((i) => i.id === id)?.status;
    expect([statusOf(pending.invitation_id), statusOf(accepted.invitation_id), statusOf(expired.invitation_id), statusOf(revoked.invitation_id)]).toEqual(["Pending", "Accepted", "Expired", "Revoked"]);
    expect(JSON.stringify(view)).not.toContain("token_hash");
    expect(JSON.stringify(view)).not.toContain(pending.token);
  }, 60000);

  it("a new invitation replaces the old link, and revoking one frees its place until it is renewed", async () => {
    const o = await newOwner("basic");
    const first = await login(o);
    const second = await one<{ token: string }>(o.user, "SELECT * FROM new_invitation($1)", [first.member_id]);
    await expect(as(null, "SELECT finish_invitation($1, $2)", [first.token, newUser()])).rejects.toThrow(/not valid/);
    const inv = await one<{ id: string }>(null, "SELECT id FROM employee_invitations WHERE member_id = $1 AND revoked_at IS NULL", [first.member_id]);
    await as(o.user, "SELECT revoke_invitation($1)", [inv.id]);
    expect((await usage(o)).active_users).toBe(1);
    await expect(as(null, "SELECT finish_invitation($1, $2)", [second.token, newUser()])).rejects.toThrow(/not valid/);
    await as(o.user, "SELECT * FROM new_invitation($1)", [first.member_id]);
    expect((await usage(o)).active_users).toBe(2);
    await expect(login(o)).rejects.toThrow(/USER_LIMIT/);
  });

  it("five wrong contact guesses use the link up", async () => {
    const o = await newOwner();
    const i = await login(o, { phone: "0711000222" });
    const verify = async (c: string) => (await one<{ r: { ok: boolean; reason?: string } }>(null, "SELECT verify_invitation($1, $2) AS r", [i.token, c])).r;
    expect((await verify("0711000222")).ok).toBe(true);
    for (let n = 0; n < 5; n++) expect((await verify("0700000000")).reason).toBe("contact");
    expect((await verify("0711000222")).reason).toBe("invalid");
    expect((await one<{ r: { valid: boolean } }>(null, "SELECT invitation_details($1) AS r", [i.token])).r.valid).toBe(false);
  });

  it("nothing on the invitation page shows a stranger the contact details", async () => {
    const o = await newOwner();
    const i = await login(o, { phone: "0733444555", email: "private@shop.co" });
    const details = (await one<{ r: Record<string, unknown> }>(null, "SELECT invitation_details($1) AS r", [i.token])).r;
    expect(details).toMatchObject({ valid: true, kind: "invite", usesEmail: true, usesPhone: true });
    expect(JSON.stringify(details)).not.toMatch(/private@shop|0733444555|733444555/);
  });

  it("a password reset needs the same login, and works once", async () => {
    const o = await newOwner();
    const m = await hire(o);
    const r = await one<{ token: string }>(o.user, "SELECT * FROM create_access_reset($1)", [m.member_id]);
    await expect(as(null, "SELECT finish_invitation($1, $2)", [r.token, newUser()])).rejects.toThrow(/not valid/);
    await as(null, "SELECT finish_invitation($1, $2)", [r.token, m.user]);
    await expect(as(null, "SELECT finish_invitation($1, $2)", [r.token, m.user])).rejects.toThrow(/not valid/);
    expect(await access(m.user, Math.floor(Date.now() / 1000) - 60)).toMatchObject({ kind: "blocked", reason: "session" }); // Old sessions ended; a new sign-in has a new token.
    expect(await access(m.user, FUTURE + 1)).toMatchObject({ kind: "member" });
  });
});

describe("what a login reaches", () => {
  it("shows only assigned businesses and locations, and the owner can change them at once", async () => {
    const o = await newOwner();
    const a = await place(o, "sa"), b = await place(o, "sb");
    const m = await hire(o, { locations: [a] });
    const places = async () => ((await access(m.user))["locations"] as { id: string }[]).map((l) => l.id);
    expect(await places()).toEqual([a]);
    expect(await as(m.user, "SELECT id FROM locations WHERE id = $1", [b])).toEqual([]);
    await as(o.user, "SELECT update_member_access($1, 'manager', $2::uuid[], $3::uuid[])", [m.member_id, [o.business], [a, b]]);
    expect((await places()).sort()).toEqual([a, b].sort());
    expect(await as(m.user, "SELECT id FROM locations WHERE id = $1", [b])).toEqual([{ id: b }]);
    await as(o.user, "SELECT update_member_access($1, 'manager', $2::uuid[], '{}'::uuid[])", [m.member_id, [o.business]]);
    expect(await places()).toEqual([]);
  });

  it("assignments must belong to the owner, to the chosen business, and be active", async () => {
    const o = await newOwner(), other = await newOwner();
    const mine = await place(o, "ma"), theirs = await place(other, "ta");
    await expect(login(o, { locations: [theirs] })).rejects.toThrow(/not available/);
    await expect(login(o, { businesses: [other.business] })).rejects.toThrow(/not available/);
    await expect(login(o, { businesses: [] })).rejects.toThrow(/Choose a business/);
    await as(o.user, "SELECT set_location_status($1, 'archived')", [mine]);
    await expect(login(o, { locations: [mine] })).rejects.toThrow(/not available/);
    const m = await hire(o);
    await expect(as(other.user, "SELECT update_member_access($1, 'staff', $2::uuid[], '{}'::uuid[])", [m.member_id, [other.business]])).rejects.toThrow(/Only the owner/);
  });

  it("role defaults are right, and Staff starts with nothing", async () => {
    const o = await newOwner("business");
    await place(o, "store", "warehouse");
    const by = async (role: string) => (await hire(o, { role })).user;
    const shop = await by("shopkeeper"), ware = await by("warehouse_staff"), manager = await by("manager"), adminUser = await by("admin");
    await expect(login(o, { role: "staff" })).rejects.toThrow(/ROLE_LIMIT/);
    expect(await can(o, shop, "module.pos.view")).toBe(true);
    expect(await can(o, shop, "module.accounting.view")).toBe(false);
    expect(await can(o, shop, "products.view_buying_price")).toBe(false);
    expect(await can(o, ware, "module.inventory.edit")).toBe(true);
    expect(await can(o, ware, "module.pos.view")).toBe(false);
    expect(await can(o, manager, "purchases.approve")).toBe(true);
    expect(await can(o, manager, "salary.view")).toBe(false);
    expect(await can(o, adminUser, "module.accounting.delete")).toBe(true);
    for (const k of ["subscription.manage", "money_transfer.initiate", "money_transfer.approve", "business.transfer_ownership", "owner.grant"]) expect(await can(o, adminUser, k)).toBe(false);
  }, 60000);

  it("a person's setting beats the owner's role change, which beats the template; changes apply immediately", async () => {
    const o = await newOwner();
    const m = await hire(o, { role: "shopkeeper" });
    const k = "module.reports.view";
    expect(await can(o, m.user, k)).toBe(false);
    await as(o.user, "SELECT set_role_permission($1, 'shopkeeper', $2, true)", [o.account, k]);
    expect(await can(o, m.user, k)).toBe(true);
    await as(o.user, "SELECT set_member_permission($1, $2, false)", [m.member_id, k]);
    expect(await can(o, m.user, k)).toBe(false);
    await as(o.user, "SELECT clear_member_permissions($1)", [m.member_id]);
    expect(await can(o, m.user, k)).toBe(true);
    const another = await newOwner();
    const hers = await hire(another, { role: "shopkeeper" });
    expect(await can(another, hers.user, k)).toBe(false); // One owner's template stays theirs.
  });

  it("nobody but the owner can change roles or permissions, and owner-only powers can't be given", async () => {
    const o = await newOwner();
    const adminM = await hire(o, { role: "admin" });
    const target = await hire(o);
    await expect(as(adminM.user, "SELECT set_role_permission($1, 'staff', 'module.pos.view', true)", [o.account])).rejects.toThrow(/Only the owner/);
    await expect(as(adminM.user, "SELECT set_member_permission($1, 'salary.view', true)", [target.member_id])).rejects.toThrow(/Only the owner/);
    await expect(as(adminM.user, "SELECT suspend_member($1)", [target.member_id])).rejects.toThrow(/Only the owner/);
    await expect(as(o.user, "SELECT set_role_permission($1, 'admin', 'money_transfer.approve', true)", [o.account])).rejects.toThrow(/stays with the owner/);
    await expect(as(o.user, "SELECT set_role_permission($1, 'owner', 'module.pos.view', false)", [o.account])).rejects.toThrow(/owner role/);
    await expect(as(adminM.user, "INSERT INTO account_role_permissions VALUES ($1, 'admin', 'owner.grant', true)", [o.account])).rejects.toThrow(/permission denied/);
    const ownerRow = await one<{ id: string }>(null, "SELECT id FROM owner_members WHERE owner_account_id = $1 AND role = 'owner'", [o.account]);
    await expect(as(o.user, "SELECT suspend_member($1)", [ownerRow.id])).rejects.toThrow(/owner/);
  });

  it("a browser can't reach the server-only functions", async () => {
    const o = await newOwner();
    for (const q of ["SELECT verify_invitation('a', 'b')", "SELECT invitation_details('a')", "SELECT mark_invitation_sent(gen_random_uuid(), 'email', NULL)"]) await expect(as(o.user, q)).rejects.toThrow(/permission denied/);
  });
});

describe("ending access", () => {
  it("suspending blocks everything at once, ends sessions, and reactivating restores it", async () => {
    const o = await newOwner();
    const a = await place(o, "x1");
    const m = await hire(o, { locations: [a] });
    await db.exec(`INSERT INTO auth.sessions (user_id) VALUES ('${m.user}')`);
    expect(await access(m.user)).toMatchObject({ kind: "member" });
    await as(o.user, "SELECT suspend_member($1)", [m.member_id]);
    expect(await access(m.user)).toEqual({ kind: "blocked", reason: "suspended" });
    expect(await can(o, m.user, "module.pos.view")).toBe(false);
    expect(await as(m.user, "SELECT id FROM locations")).toEqual([]);
    expect((await db.query(`SELECT 1 FROM auth.sessions WHERE user_id = '${m.user}'`)).rows).toEqual([]);
    const { phone: registered } = await one<{ phone: string }>(null, "SELECT phone FROM owner_members WHERE id = $1", [m.member_id]);
    expect((await one<{ r: { status: string } }>(null, "SELECT resolve_login($1) AS r", [registered])).r.status).toBe("suspended");
    await as(o.user, "SELECT reactivate_member($1)", [m.member_id]);
    expect(await access(m.user, FUTURE + 1)).toMatchObject({ kind: "member" });
  });

  it("revoking sessions stops old tokens only; a fresh sign-in works", async () => {
    const o = await newOwner();
    const m = await hire(o);
    const before = Math.floor(Date.now() / 1000) - 60;
    expect(await can(o, m.user, "module.pos.view", before)).toBe(true);
    await as(o.user, "SELECT revoke_member_sessions($1)", [m.member_id]);
    expect(await access(m.user, before)).toEqual({ kind: "blocked", reason: "session" });
    expect(await can(o, m.user, "module.pos.view", before)).toBe(false);
    expect(await access(m.user, FUTURE)).toMatchObject({ kind: "member" });
  });

  it("terminating ends access and frees the place, keeps the record and the audit, and blocks a new link", async () => {
    const o = await newOwner();
    const m = await hire(o);
    await as(o.user, "SELECT terminate_member($1)", [m.member_id]);
    expect(await access(m.user)).toEqual({ kind: "blocked", reason: "revoked" });
    expect((await usage(o)).active_users).toBe(1);
    const row = await one<{ status: string; terminated_at: string; full_name: string }>(o.user, "SELECT status, terminated_at, full_name FROM owner_members WHERE id = $1", [m.member_id]);
    expect(row).toMatchObject({ status: "revoked", full_name: "Worker" });
    expect(row.terminated_at).toBeTruthy();
    await expect(as(o.user, "SELECT * FROM new_invitation($1)", [m.member_id])).rejects.toThrow(/employment has ended/);
    const actions = (await as<{ action: string }>(o.user, "SELECT action FROM audit_logs WHERE record_id = $1", [m.member_id])).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["LOGIN CREATED", "INVITATION ACCEPTED", "EMPLOYEE REVOKED", "EMPLOYMENT TERMINATED"]));
  });

  it("an ended subscription blocks employees without deleting them", async () => {
    const o = await newOwner();
    const m = await hire(o);
    await as(null, "UPDATE owner_subscriptions SET status = 'cancelled' WHERE owner_account_id = $1", [o.account]);
    expect(await access(m.user)).toEqual({ kind: "blocked", reason: "subscription" });
    await expect(login(o)).rejects.toThrow(/SUBSCRIPTION_INACTIVE/);
    expect((await one<{ n: number }>(o.user, "SELECT count(*)::int AS n FROM owner_members WHERE id = $1", [m.member_id])).n).toBe(1);
  });

  it("a stranger and an unconnected login get nothing", async () => {
    const stranger = newUser();
    expect(await access(stranger)).toEqual({ kind: "none" });
    await db.exec("SET ROLE anon");
    await expect(db.query("SELECT my_access()")).rejects.toThrow(/permission denied/);
    await expect(db.query("SELECT * FROM login_events")).rejects.toThrow(/permission denied/);
    await db.exec("RESET ROLE");
  });
});
