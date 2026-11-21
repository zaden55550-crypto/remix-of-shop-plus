// One employee identity with memberships in several of the owner's businesses (proposed 0020), on a real PostgreSQL engine with
// every migration in deployment order. Acts as the real owner and the real employee (auth.uid()), as the server would.
import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { applyChain, proposedFile, rollbackFile } from "./migration-chain";

let db: PGlite, seq = 0, phone = 711000000;
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const newUser = () => uuid(++seq);
async function as<T = Record<string, unknown>>(user: string | null, sql: string, params: unknown[] = []) {
  await db.exec(`RESET ROLE; SELECT set_config('test.uid', '${user ?? ""}', false), set_config('test.email', 'x@x.co', false), set_config('test.iat', '4000000000', false), set_config('test.role', '${user ? "authenticated" : "service_role"}', false); SET ROLE ${user ? "authenticated" : "service_role"};`);
  try { return (await db.query<T>(sql, params)).rows; } finally { await db.exec("RESET ROLE"); }
}
const one = async <T = Record<string, unknown>>(user: string | null, sql: string, params: unknown[] = []) => (await as<T>(user, sql, params))[0] as T;
type Owner = { user: string; account: string; business: string };
type Membership = { id: string; erpRef: string | null; name: string; role: string; permissions: string[]; locations: { id: string; erpRef: string | null }[] };

async function newOwner(): Promise<Owner> {
  const user = newUser(), r = await one<{ c: { account: string; business: string } }>(user, "SELECT connect_owner($1, 'Owner', $2, $1, 'KES') AS c", [`Shop ${user}`, `legacy-${user}`]);
  await as(null, "SELECT apply_verified_subscription($1, 'business', 'monthly', now() + interval '30 days', $2)", [r.c.account, `ref-${user}`]);
  lastAccount = r.c.account;
  return { user, ...r.c };
}
const place = async (o: Owner, business: string, ref: string, kind = "shop") => (await one<{ id: string }>(o.user, "SELECT sync_location($1, $2, $3, $2, $4, true) AS id", [business, ref, `Place ${ref}`, kind])).id;
async function hire(o: Owner, role: string, locations: string[], person?: string) {
  const n = ++phone;
  const i = await one<{ member_id: string; token: string }>(o.user, "SELECT * FROM create_login($1, $2, 'Worker', $3, NULL, 'EMP-1', $4, $5::uuid[], $6::uuid[])", [o.account, `ref-${n}`, `0${n}`, role, [o.business], locations]);
  const user = person ?? newUser();
  await as(null, "SELECT finish_invitation($1, $2)", [i.token, user]);
  return { member: i.member_id, user };
}
let lastAccount = "";
const access = async (user: string, account = lastAccount) => (await one<{ a: Membership[] }>(user, "SELECT member_business_access($1) AS a", [account])).a;
const myAccess = async (user: string) => (await one<{ a: { permissions: string[]; locations: { id: string }[] } }>(user, "SELECT my_access() AS a")).a;
const can = async (user: string, o: Owner, business: string, key: string) => (await one<{ ok: boolean }>(user, "SELECT has_business_permission($1, $2, $3) AS ok", [o.account, business, key])).ok;

beforeEach(async () => { db = new PGlite(); await applyChain(db); });

describe("employees in several businesses (proposed 0020)", () => {
  it("keeps an existing employee's access exactly as my_access gives it, under the first business", async () => {
    const o = await newOwner();
    const shop = await place(o, o.business, "s1");
    const e = await hire(o, "shopkeeper", [shop]);
    const [first, ...rest] = await access(e.user);
    expect(rest).toEqual([]);
    expect(first).toMatchObject({ id: o.business, erpRef: "biz-main", role: "shopkeeper" });
    const before = await myAccess(e.user);
    expect([...first!.permissions].sort()).toEqual([...before.permissions].sort());
    expect(first!.locations.map((l) => l.id)).toEqual(before.locations.map((l) => l.id));
  });

  it("gives one identity a second business with its own role, permissions and locations", async () => {
    const o = await newOwner();
    const shop = await place(o, o.business, "s1");
    const e = await hire(o, "shopkeeper", [shop]);
    const second = await one<{ id: string }>(o.user, "SELECT link_erp_business($1, 'clinic12345', 'Afya Clinic', 'KSH') AS id", [o.account]);
    const clinicShop = await place(o, second.id, "c1");
    await as(o.user, "SELECT grant_member_business($1, $2, 'manager', $3::uuid[], $4::jsonb)", [e.member, second.id, [clinicShop], JSON.stringify({ "salary.view": false })]);
    const list = await access(e.user);
    expect(list.map((m) => [m.erpRef, m.role, m.locations.map((l) => l.id)])).toEqual([["biz-main", "shopkeeper", [shop]], ["clinic12345", "manager", [clinicShop]]]);
    // Permissions are decided per business: the clinic's override and role apply there only.
    expect(list[1]!.permissions).not.toContain("salary.view");
    expect(await can(e.user, o, second.id, "salary.view")).toBe(false);
    expect(await can(e.user, o, o.business, "module.sales.view")).toBe(true);
    // A person still counts once, however many businesses they reach.
    expect((await one<{ active_users: number }>(o.user, "SELECT active_users FROM account_usage($1)", [o.account])).active_users).toBe(2);
  });

  it("removing one business leaves the others' access, locations and permissions as they were", async () => {
    const o = await newOwner();
    const shop = await place(o, o.business, "s1");
    const e = await hire(o, "shopkeeper", [shop]);
    const second = await one<{ id: string }>(o.user, "SELECT link_erp_business($1, 'clinic12345', 'Afya Clinic', 'KSH') AS id", [o.account]);
    const clinicShop = await place(o, second.id, "c1");
    await as(o.user, "SELECT grant_member_business($1, $2, NULL, $3::uuid[], $4::jsonb)", [e.member, second.id, [clinicShop], JSON.stringify({ "module.sales.view": false })]);
    const firstBefore = (await access(e.user))[0];
    await as(o.user, "SELECT revoke_member_business($1, $2)", [e.member, second.id]);
    expect(await access(e.user)).toEqual([firstBefore]);
    expect(await can(e.user, o, second.id, "module.sales.view")).toBe(false);
    expect((await db.query<{ n: number }>("SELECT count(*)::int n FROM member_business_permissions WHERE member_id = $1", [e.member])).rows[0]!.n).toBe(0);
  });

  it("refuses a location of another business, and never lets an employee link or grant", async () => {
    const o = await newOwner();
    const shop = await place(o, o.business, "s1");
    const e = await hire(o, "shopkeeper", [shop]);
    const second = await one<{ id: string }>(o.user, "SELECT link_erp_business($1, 'clinic12345', 'Afya Clinic', 'KSH') AS id", [o.account]);
    await expect(as(o.user, "SELECT grant_member_business($1, $2, NULL, $3::uuid[], NULL)", [e.member, second.id, [shop]])).rejects.toThrow(/not part of this business/);
    await expect(as(e.user, "SELECT link_erp_business($1, 'other12345', 'Mine', 'KSH')", [o.account])).rejects.toThrow(/Only the owner/);
    await expect(as(e.user, "SELECT grant_member_business($1, $2, 'admin', '{}'::uuid[], NULL)", [e.member, second.id])).rejects.toThrow(/Only the owner/);
    await expect(as(o.user, "SELECT grant_member_business($1, $2, 'owner', '{}'::uuid[], NULL)", [e.member, second.id])).rejects.toThrow(/Invalid role/);
  });

  it("another owner's business can't be granted, and a revoked login reaches nothing", async () => {
    const a = await newOwner(), b = await newOwner();
    const shop = await place(a, a.business, "s1");
    const e = await hire(a, "shopkeeper", [shop]);
    await expect(as(a.user, "SELECT grant_member_business($1, $2, NULL, '{}'::uuid[], NULL)", [e.member, b.business])).rejects.toThrow(/Business not found/);
    expect(await can(e.user, b, b.business, "module.sales.view")).toBe(false);
    await as(null, "UPDATE owner_members SET status = 'revoked' WHERE id = $1", [e.member]);
    expect(await access(e.user, a.account)).toEqual([]);
  });

  it("a person with seats at two owners gets each owner's businesses only from that owner's seat", async () => {
    const a = await newOwner(), b = await newOwner();
    const shopA = await place(a, a.business, "sa"), shopB = await place(b, b.business, "sb");
    const e = await hire(a, "shopkeeper", [shopA]);
    await hire(b, "manager", [shopB], e.user); // the same person, hired by a second owner
    const inA = await access(e.user, a.account), inB = await access(e.user, b.account);
    expect(inA.map((m) => [m.id, m.role, m.locations.map((l) => l.id)])).toEqual([[a.business, "shopkeeper", [shopA]]]);
    expect(inB.map((m) => [m.id, m.role, m.locations.map((l) => l.id)])).toEqual([[b.business, "manager", [shopB]]]);
  });

  it("refuses to link a second business under a name the owner already uses", async () => {
    const o = await newOwner();
    await as(o.user, "SELECT link_erp_business($1, 'clinic12345', 'Afya Clinic', 'KSH')", [o.account]);
    await expect(as(o.user, "SELECT link_erp_business($1, 'other12345', 'afya clinic', 'KSH')", [o.account])).rejects.toThrow(/already exists/);
    expect((await one<{ id: string }>(o.user, "SELECT link_erp_business($1, 'clinic12345', 'Afya Clinic', 'KSH') AS id", [o.account])).id).toBeTruthy(); // linking again is safe
  });

  it("a rollback removes access to businesses linked through 0020, so it can never widen what an employee may do", async () => {
    const o = await newOwner();
    const shop = await place(o, o.business, "s1");
    const e = await hire(o, "shopkeeper", [shop]);
    const second = await one<{ id: string }>(o.user, "SELECT link_erp_business($1, 'clinic12345', 'Afya Clinic', 'KSH') AS id", [o.account]);
    const clinicShop = await place(o, second.id, "c1");
    await as(o.user, "SELECT grant_member_business($1, $2, NULL, $3::uuid[], $4::jsonb)", [e.member, second.id, [clinicShop], JSON.stringify({ "module.sales.view": false })]);
    const firstLocations = (await myAccess(e.user)).locations.map((l) => l.id).filter((id) => id !== clinicShop);
    await db.exec(rollbackFile("0020_member_business_access"));
    const after = (await one<{ a: { businesses: { id: string }[]; locations: { id: string }[] } }>(e.user, "SELECT my_access() AS a")).a;
    expect(after.businesses.map((b) => b.id)).toEqual([o.business]);
    expect(after.locations.map((l) => l.id)).toEqual(firstLocations);
  });

  it("rolls back to one access set per seat, keeps memberships, and can be applied again", async () => {
    const o = await newOwner();
    const shop = await place(o, o.business, "s1");
    const e = await hire(o, "shopkeeper", [shop]);
    const before = await myAccess(e.user);
    await db.exec(rollbackFile("0020_member_business_access"));
    expect(await myAccess(e.user)).toEqual(before);
    await db.exec(proposedFile("0020_member_business_access"));
    expect((await access(e.user)).map((m) => m.erpRef)).toEqual(["biz-main"]);
  });
});
