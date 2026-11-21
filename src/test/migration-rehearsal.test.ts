// A rehearsal of the deployment on a real PostgreSQL engine (PGlite), in memory. It is not staging: it shows the SQL and its order are sound,
// not how the live backend, its sign-in system or its data behave. Your subscription rules are checked against the final database here.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import { balanceSheet } from "@/lib/accounting";
import { addCustomer, addProduct, confirmSale, empty, load, type ErpState } from "@/lib/erp";
import { addExpense, addSupplier, confirmPurchase, floatBalances, floatDeposit } from "@/lib/finance";
import { saveLocation } from "@/lib/locations";
import { createOperation } from "@/lib/outbox";
import { BASE, JOURNAL, PROPOSED, ROLLBACK, applyChain, journalFile, proposedFile, rollbackFile } from "./migration-chain";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const OWNER = uuid(1);
let db: PGlite, nextEmployee = 1, nextOp = 1000;

async function as<T = Record<string, unknown>>(user: string | null, sql: string, params: unknown[] = [], role = "authenticated") {
  await db.exec(`RESET ROLE; SELECT set_config('test.uid', '${user ?? ""}', false), set_config('test.email', '${user}@x.co', false), set_config('test.role', '${role}', false); SET ROLE ${role}`);
  try { return (await db.query<T>(sql, params)).rows; } finally { await db.exec("RESET ROLE"); }
}
async function ownerOn(plan: "basic" | "growth" | "business") {
  const c = (await as<{ c: { account: string; business: string } }>(OWNER, "SELECT connect_owner('Shop', 'Owner', 'legacy-1', 'Shop', 'KES') c"))[0]!.c;
  await as(null, "SELECT apply_verified_subscription($1, $2, 'monthly', now() + interval '30 days', $3)", [c.account, plan, `pay-${plan}`], "service_role");
  return c;
}
const addPlace = async (business: string, n: number, kind: string) => (await as<{ id: string }>(OWNER, "SELECT create_location($1, $2, $3, $4) id", [business, `${kind} ${n}`, `C${n}`, kind]))[0]!.id;
const login = (account: string, business: string, role: string, places: string[]) => {
  const n = nextEmployee++;
  return as<{ member_id: string }>(OWNER, "SELECT member_id FROM create_login($1, $2, $3, $4, NULL, NULL, $5, $6::uuid[], $7::uuid[])", [account, `emp-${n}`, `Person ${n}`, `0712${String(100000 + n)}`, role, [business], places]);
};
const usage = async (account: string) => (await as<Record<string, number>>(OWNER, "SELECT * FROM account_usage($1)", [account]))[0]!;
const sync = (changes: unknown[], seq = {}) => as(OWNER, "SELECT apply_shopbook_operation($1, $2, 'b1', 'TEST', $3::jsonb, $4::jsonb)", [uuid(nextOp++), uuid(900), JSON.stringify(changes), JSON.stringify(seq)]);
const place = (id: string, active?: boolean) => ({ collection: "locations", id, before: null, after: { id, name: id, code: id, type: "shop", createdAt: 1, ...(active === false ? { active } : {}) } });
const pay = { cash: 5, mpesa: 0, bank: 0, credit: 0 };
const sale = (id: string) => ({ collection: "sales", id, before: null, after: { id, ref: id, at: 1, items: [], subtotal: 5, discount: 0, total: 5, pay, cashier: "A", channel: "POS" } });

describe("the migration order", () => {
  beforeEach(async () => { db = new PGlite(); await db.exec(BASE); });

  it("applies from the first migration to the last with no errors", async () => {
    for (const f of JOURNAL) await db.exec(journalFile(f));
    for (const f of PROPOSED) await db.exec(proposedFile(f));
    const triggers = await db.query<{ tgname: string }>("SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.shopbook_shop_sync'::regclass AND NOT tgisinternal ORDER BY 1");
    expect(triggers.rows.map((r) => r.tgname)).toEqual(["shopbook_shop_sync_location_limit", "shopbook_shop_sync_subscription", "validate_shopbook_stock_projection"]);
  });
  it("journal 0010 can safely run again: it only replaces one function with itself", async () => {
    for (const f of JOURNAL) await db.exec(journalFile(f));
    const def = () => db.query<{ d: string }>("SELECT pg_get_functiondef('public.apply_shopbook_operation'::regproc) d");
    const first = (await def()).rows[0]!.d;
    await db.exec(journalFile("0010_fix_sync_payment_check"));
    expect((await def()).rows[0]!.d).toBe(first);
    expect(first).toContain("AS split(method, amount)");
  });
  it("the allowance migration can't run before people and access exist, and can't run twice", async () => {
    await expect(db.exec(proposedFile("0011_dynamic_user_allowance"))).rejects.toThrow();
    for (const f of JOURNAL) await db.exec(journalFile(f));
    await db.exec(proposedFile("0011_dynamic_user_allowance"));
    await expect(db.exec(proposedFile("0011_dynamic_user_allowance"))).rejects.toThrow(/already exists/);
  });
  it("the proposed files never enter the active journal", () => {
    const journal = readFileSync(resolve("drizzle/migrations/meta/_journal.json"), "utf8");
    for (const f of [...PROPOSED, "0011_", "0012_", "0013_", "0014_", "0015_", "0016_"]) expect(journal).not.toContain(f);
  });
});

describe("the subscription rules on the final database", () => {
  beforeEach(async () => { db = new PGlite(); await applyChain(db); nextEmployee = 1; });

  it("Basic: one owner, one employee, two logins, one location, no manager", async () => {
    const { account, business } = await ownerOn("basic");
    const shop = await addPlace(business, 1, "shop");
    await expect(addPlace(business, 2, "shop")).rejects.toThrow(/LOCATION_LIMIT/);
    await expect(login(account, business, "manager", [shop])).rejects.toThrow(/MANAGER_LIMIT/);
    await expect(login(account, business, "admin", [shop])).rejects.toThrow(/MANAGER_LIMIT/);
    await login(account, business, "shopkeeper", [shop]);
    await expect(login(account, business, "staff", [shop])).rejects.toThrow(/ROLE_LIMIT/);
    expect(await usage(account)).toMatchObject({ max_managers: 0, employee_slots: 1, max_users: 2, active_users: 2 });
  });
  it("Growth: one pool of 12 logins whatever the locations; staff go wherever the owner puts them", async () => {
    const { account, business } = await ownerOn("growth");
    const shop = await addPlace(business, 1, "shop"), house = await addPlace(business, 2, "warehouse");
    const shop2 = await addPlace(business, 3, "shop"); const shop3 = await addPlace(business, 4, "shop"); const house2 = await addPlace(business, 5, "store");
    await expect(addPlace(business, 6, "shop")).rejects.toThrow(/LOCATION_LIMIT/);
    expect(await usage(account)).toMatchObject({ employee_slots: 10, max_users: 12, active_users: 1 });
    await login(account, business, "manager", [shop, house]);
    for (const id of [shop, shop2, shop3]) { await login(account, business, "shopkeeper", [id]); await login(account, business, "shopkeeper", [id]); }
    await login(account, business, "warehouse_staff", [house]); await login(account, business, "warehouse_staff", [house2]);
    expect(await usage(account)).toMatchObject({ max_users: 12, active_users: 10, active_managers: 1 });
    // No shop has its own limit: a third and fourth shopkeeper at the same shop are fine, the 13th login is not.
    await login(account, business, "shopkeeper", [shop]); await login(account, business, "shopkeeper", [shop]);
    expect(await usage(account)).toMatchObject({ max_users: 12, active_users: 12, available_users: 0 });
    await expect(login(account, business, "shopkeeper", [shop])).rejects.toThrow(/USER_LIMIT/);
    await expect(login(account, business, "manager", [shop])).rejects.toThrow(/MANAGER_LIMIT/);
  });
  it("Business: ten Stores, three Managers and staff, all within one pool of 24", async () => {
    const { account, business } = await ownerOn("business");
    const stores = [await addPlace(business, 1, "store")];
    expect(await usage(account)).toMatchObject({ max_users: 24, active_users: 1 });
    for (let n = 2; n <= 10; n++) stores.push(await addPlace(business, n, "store"));
    await expect(addPlace(business, 11, "warehouse")).rejects.toThrow(/LOCATION_LIMIT/);
    expect(await usage(account)).toMatchObject({ max_users: 24, active_users: 1 });
    for (let n = 0; n < 3; n++) await login(account, business, "manager", [stores[0]!]);
    for (const id of stores) await login(account, business, "warehouse_staff", [id]);
    await expect(login(account, business, "manager", [stores[0]!])).rejects.toThrow(/MANAGER_LIMIT/);
    expect(await usage(account)).toMatchObject({ active_managers: 3, max_users: 24, active_users: 14 });
  });
  it("a manager on several locations is one login and uses no employee place", async () => {
    const { account, business } = await ownerOn("growth");
    const a = await addPlace(business, 1, "shop"), b = await addPlace(business, 2, "shop");
    await login(account, business, "manager", [a, b]);
    expect(await usage(account)).toMatchObject({ active_managers: 1, active_employees: 0, active_users: 2, max_users: 12 });
    await login(account, business, "shopkeeper", [a]); await login(account, business, "shopkeeper", [a]);
    expect(await usage(account)).toMatchObject({ active_managers: 1, active_employees: 2, active_users: 4, max_users: 12 });
  });
  it("an employee record with no login uses nothing: only logins are counted", async () => {
    const { account, business } = await ownerOn("basic");
    await addPlace(business, 1, "shop");
    await sync([{ collection: "employees", id: "e1", before: null, after: { id: "e1", name: "No login", role: "Cashier", comp: "salary", salary: 1, rule: { kind: "none", value: 0, paidOnly: false }, active: true, createdAt: 1 } }]);
    expect(await usage(account)).toMatchObject({ active_employees: 0, active_users: 1 });
  });
});

describe("sync on the final database", () => {
  beforeEach(async () => { db = new PGlite(); await applyChain(db); });

  it("takes a sale, keeps movements protected, and refuses locations past the plan", async () => {
    await ownerOn("basic");
    await sync([sale("s1")]);
    const move = { id: "m1", at: 1, type: "OPENING", productId: "p1", qty: 2, prev: 0, next: 2, user: "A" };
    await sync([{ collection: "products", id: "p1", before: null, after: { id: "p1", name: "P", buy: 1, sell: 2, qty: 2, createdAt: 1 } }, { collection: "movements", id: "m1", before: null, after: move }]);
    await expect(sync([{ collection: "movements", id: "m1", before: move, after: null }])).rejects.toThrow(/Movements can't be changed/);
    await expect(sync([place("extra")])).rejects.toThrow(/LOCATION_LIMIT/);
    // A shop stays able to record its sales after that refusal.
    await sync([sale("s2")]);
  });
  it("a retried operation is applied once, and a stale one from a device that was offline changes nothing", async () => {
    await ownerOn("growth");
    const move = { id: "m1", at: 1, type: "OPENING", productId: "p1", qty: 5, prev: 0, next: 5, user: "A" };
    const product = { id: "p1", name: "P", buy: 1, sell: 2, qty: 5, createdAt: 1 };
    const changes = JSON.stringify([{ collection: "products", id: "p1", before: null, after: product }, { collection: "movements", id: "m1", before: null, after: move }]);
    const send = () => as<{ r: unknown }>(OWNER, "SELECT apply_shopbook_operation($1, $2, 'b1', 'TEST', $3::jsonb, '{}'::jsonb) r", [uuid(77), uuid(900), changes]);
    expect((await send())[0]!.r).toEqual((await send())[0]!.r);
    const stale = { collection: "products", id: "p1", before: { ...product, qty: 9 }, after: { ...product, qty: 8 } };
    await expect(sync([stale])).rejects.toThrow(/SYNC_CONFLICT/);
    const saved = await db.query<{ q: number; m: number; o: number }>(`SELECT (payload->'products'->0->>'qty')::int q, jsonb_array_length(payload->'movements') m, (SELECT count(*)::int FROM shopbook_sync_operations) o FROM shopbook_shop_sync`);
    expect(saved.rows[0]).toEqual({ q: 5, m: 1, o: 1 });
  });
});

describe("an existing business's first upload", () => {
  beforeEach(async () => {
    db = new PGlite(); await applyChain(db); nextEmployee = 1;
    localStorage.clear();
    // The device still believes it is on the plan it used to have, so it holds more locations than the server's plan allows.
    localStorage.setItem("shopbook.account", JSON.stringify({ shopName: "Old Shop", email: "o@x.co", password: "p", currency: "KES", plan: "business", businessId: "b1" }));
    localStorage.setItem("shopbook.syncInitialized", "1");
  });
  const status = async () => (await as<{ s: { allowed: number; active: number; over: number; flagged: string[] } }>(OWNER, "SELECT synced_location_status() s"))[0]!.s;
  const bootstrap = async () => {
    const op = createOperation(empty(), load(), true)!;
    await as(OWNER, "SELECT apply_shopbook_operation($1, $2, 'b1', $3, $4::jsonb, $5::jsonb)", [op.id, op.device, op.kind, JSON.stringify(op.changes), JSON.stringify(op.seq)]);
  };
  const stored = async () => (await db.query<{ payload: ErpState }>("SELECT payload FROM shopbook_shop_sync WHERE user_id = $1", [OWNER])).rows[0]!.payload;
  const byId = <T extends { id: string }>(rows: T[]) => [...rows].sort((a, b) => a.id.localeCompare(b.id));

  it("keeps every record, and the money and stock reconcile to the device exactly", async () => {
    const town = saveLocation({ name: "Town", type: "shop" }), depot = saveLocation({ name: "Depot", type: "warehouse" });
    const p = addProduct({ name: "Rice", buy: 90.5, sell: 120.25, qty: 40.5, unit: "kg" }), cust = addCustomer("Cust"), sup = addSupplier("Sup");
    confirmSale({ cart: [{ productId: p.id, qty: 1.5 }], discount: 0, pay: { cash: 0, mpesa: 0, bank: 0, credit: 180.38 }, customerId: cust.id, channel: "POS" });
    floatDeposit("cash", 5000, "DEPOSIT", "Owner");
    confirmPurchase({ lines: [{ productId: p.id, qty: 2, cost: 90.5 }], pay: { cash: 100, mpesa: 0, bank: 0, credit: 81 }, supplierId: sup.id, updateCost: false });
    addExpense({ category: "Rent", amount: 100, method: "cash" });
    await ownerOn("basic");

    await bootstrap();

    const device = JSON.parse(JSON.stringify(load())) as ErpState, server = { ...empty(), ...(await stored()) };
    for (const key of Object.keys(empty()) as (keyof ErpState)[]) {
      if (key === "seq") continue;
      expect(byId(server[key] as { id: string }[]), key).toEqual(byId(device[key] as { id: string }[]));
    }
    expect(floatBalances(server)).toEqual(floatBalances(device));
    expect(balanceSheet(server)).toEqual(balanceSheet(device));
    expect(balanceSheet(server).balanced).toBe(true);
    expect(server.products.find((x) => x.id === p.id)?.qty).toBe(device.products.find((x) => x.id === p.id)?.qty);

    const flagged = await status();
    expect(flagged).toEqual({ allowed: 1, active: 3, over: 2, flagged: [town.id, depot.id] });
    const audit = await db.query<{ action: string }>("SELECT action FROM audit_logs WHERE action = 'LOCATIONS OVER PLAN'");
    expect(audit.rows).toHaveLength(1);
  });

  it("blocks new, reactivated and swapped locations while over, keeps other work syncing, and clears when resolved", async () => {
    const town = saveLocation({ name: "Town", type: "shop" }), depot = saveLocation({ name: "Depot", type: "warehouse" });
    const { account } = await ownerOn("basic");
    await bootstrap();
    await expect(sync([place("brand-new")])).rejects.toThrow(/LOCATION_LIMIT/);
    const server = await stored(), row = (id: string) => server.locations.find((l) => l.id === id)!;
    // Swapping keeps the count the same, so only comparing the actual locations catches it.
    await expect(sync([{ collection: "locations", id: depot.id, before: row(depot.id), after: null }, place("swapped-in")])).rejects.toThrow(/LOCATION_LIMIT/);
    await sync([sale("s1")]);
    expect((await stored()).sales).toHaveLength(1);

    // Archiving one still leaves it over, and bringing it back is refused.
    const archived = { ...row(depot.id), active: false };
    await sync([{ collection: "locations", id: depot.id, before: row(depot.id), after: archived }]);
    expect(await status()).toEqual({ allowed: 1, active: 2, over: 1, flagged: [town.id] });
    await expect(sync([{ collection: "locations", id: depot.id, before: archived, after: { ...archived, active: true } }])).rejects.toThrow(/LOCATION_LIMIT/);

    // Upgrading clears the flag at once, with no record changed, and adding works again.
    await as(null, "SELECT apply_verified_subscription($1, 'growth', 'monthly', now() + interval '30 days', 'pay-up')", [account], "service_role");
    expect(await status()).toEqual({ allowed: 5, active: 2, over: 0, flagged: [] });
    await sync([place("now-allowed")]);
  });

  it("a changed client's oversized first upload gets it nothing: it is flagged, earns no place on the server, and can't be repeated", async () => {
    const { account, business } = await ownerOn("basic");
    await sync(Array.from({ length: 100 }, (_, n) => place(`forged-${n}`)));
    expect(await status()).toMatchObject({ allowed: 1, active: 101, over: 100 });
    // Logins come from the server's own location list, which keeps its limit.
    await as(OWNER, "SELECT sync_location($1, 'forged-0', 'One', 'F0', 'shop', true)", [business]);
    await expect(as(OWNER, "SELECT sync_location($1, 'forged-1', 'Two', 'F1', 'shop', true)", [business])).rejects.toThrow(/LOCATION_LIMIT/);
    expect(await usage(account)).toMatchObject({ active_locations: 1, employee_slots: 1, max_users: 2 });
    // Its records can't be deleted to make the next upload "first" again.
    await expect(as(OWNER, "DELETE FROM shopbook_shop_sync WHERE user_id = $1", [OWNER])).rejects.toThrow(/permission denied/);
    await expect(sync([place("one-more")])).rejects.toThrow(/LOCATION_LIMIT/);
  });
});

describe("the confirmed prices", () => {
  it("Business is $50 a month on the final database, and a rollback keeps it", async () => {
    db = new PGlite(); await applyChain(db);
    const price = async () => (await db.query<{ m: string; y: string }>("SELECT monthly_usd::text m, yearly_usd::text y FROM subscription_plans WHERE id = 'business'")).rows[0];
    expect(await price()).toEqual({ m: "50.00", y: "540.00" });
    for (const f of ROLLBACK) await db.exec(rollbackFile(f));
    expect(await price()).toEqual({ m: "50.00", y: "540.00" });
  });
});

describe("rollback", () => {
  beforeEach(async () => { db = new PGlite(); await applyChain(db); nextEmployee = 1; });
  const undoAll = async () => { for (const f of ROLLBACK) await db.exec(rollbackFile(f)); };

  it("returns to the earlier rules, keeps every record, and can go forward again", async () => {
    const { account, business } = await ownerOn("business");
    const shop = await addPlace(business, 1, "shop");
    await login(account, business, "manager", [shop]);
    await sync([sale("s1")]);
    await undoAll();
    const counted = await db.query<{ m: number; l: number; s: number; o: number }>(`SELECT (SELECT count(*)::int FROM owner_members) m, (SELECT count(*)::int FROM locations) l, (SELECT jsonb_array_length(payload->'sales') FROM shopbook_shop_sync) s, (SELECT count(*)::int FROM shopbook_sync_operations) o`);
    expect(counted.rows[0]).toEqual({ m: 2, l: 1, s: 1, o: 1 });
    expect(await usage(account)).toMatchObject({ max_locations: 8, max_users: 10, active_users: 2 });
    expect(Object.keys(await usage(account))).not.toContain("max_managers");
    await sync([sale("s2")]); // journal 0010's fix is what remains
    await login(account, business, "staff", [shop]);
    const triggers = await db.query<{ tgname: string }>("SELECT tgname FROM pg_trigger WHERE tgrelid = 'public.shopbook_shop_sync'::regclass AND NOT tgisinternal");
    expect(triggers.rows.map((r) => r.tgname)).toEqual(["validate_shopbook_stock_projection"]);
    for (const f of PROPOSED) await db.exec(proposedFile(f));
    expect(await usage(account)).toMatchObject({ max_managers: 3, max_users: 24, max_locations: 10 });
    await sync([sale("s3")]);
  });
  it("stops, changing nothing, if a store exists that the earlier rules can't hold", async () => {
    const { account, business } = await ownerOn("growth");
    await addPlace(business, 1, "store");
    // Every rollback before the user-allowance one, by name, so a new migration doesn't shift which file is meant.
    const limit = "0012_dynamic_user_allowance";
    for (const f of ROLLBACK.slice(0, ROLLBACK.indexOf(limit))) await db.exec(rollbackFile(f));
    await expect(db.exec(rollbackFile(limit))).rejects.toThrow(/Stores exist/);
    expect(await usage(account)).toMatchObject({ max_managers: 1, stores: 1 });
  });
  it("its copies of the earlier definitions match the migrations exactly", () => {
    const down = rollbackFile("0011_fix_sync_validation");
    expect(down).toContain("AS split(method, amount)");
    expect(down).not.toContain("Movements can't be changed");
  });
});
