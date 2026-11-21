// After the 30-day trial the business is read-only, not locked: people sign in, view and export what they were already allowed to,
// and nothing new is recorded until a plan is paid for. Checked on the device and on a real PostgreSQL engine (PGlite) with the
// proposed migration 0014, which is what makes the server refuse the same writes.
import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it, vi } from "vitest";

const server = vi.hoisted(() => ({ staffRecord: vi.fn(), staffSnapshot: vi.fn(), applyOperation: vi.fn(), getUser: vi.fn() }));
vi.mock("@/lib/people-access.functions", () => ({ staffRecord: server.staffRecord, staffSnapshot: server.staffSnapshot, employeeSignIn: vi.fn(), myAccess: vi.fn() }));
vi.mock("@/lib/sync.functions", () => ({ applyOperation: server.applyOperation }));
vi.mock("@/lib/connectivity", () => ({ getConnectivity: () => ({ backend: "up" }), ACTIVE_CHECK_MS: 3600000 }));
vi.mock("@/integrations/supabase/client", () => {
  const query = { select: () => query, eq: () => query, maybeSingle: async () => ({ data: null, error: null }) };
  return { supabase: { auth: { getUser: server.getUser, signOut: vi.fn(async () => ({})), onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }) }, from: () => query } };
});

const erp = await import("@/lib/erp");
const { getOutbox } = await import("@/lib/outbox");
const { APPS, canOpen, canRecord, READ_ONLY_MESSAGE, store } = await import("@/lib/shopbook");
const { SHEETS } = await import("@/lib/records-export");
const { backupJson, restoreJson } = await import("@/lib/backup");
const { buyPlan } = await import("@/lib/plan-change");
const { sendStaffQueue } = await import("@/lib/staff-session");
const { HELD, startShopSync } = await import("@/lib/shop-sync");
const { applyChain } = await import("./migration-chain");

const DAY = 86400000;
const owner = (trialStart: number, plan: string = "trial") => localStorage.setItem("shopbook.account", JSON.stringify({ shopName: "Duka", email: "o@x.co", currency: "KES", password: "x", plan, trialStart }));
const activeTrial = () => owner(Date.now() - 5 * DAY);
const endedTrial = () => owner(Date.now() - 31 * DAY);
const cash = (n: number) => ({ cash: n, mpesa: 0, bank: 0, credit: 0 });

/** A shop with a product, a sale and a customer, recorded while the trial was running. */
function recordedDuringTrial() {
  localStorage.clear();
  activeTrial();
  const p = erp.addProduct({ name: "Sugar", buy: 1, sell: 5, qty: 10 } as Parameters<typeof erp.addProduct>[0]);
  erp.confirmSale({ cart: [{ productId: p.id, qty: 2 }], discount: 0, pay: cash(10), channel: "POS" });
  erp.addCustomer("Wanjiru", "0711000000");
  return p;
}
const saved = () => localStorage.getItem("shopbook.erp");

beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); });

describe("on the owner's device", () => {
  it("during the trial records as normal", () => {
    const p = recordedDuringTrial();
    expect(canRecord(store.get())).toBe(true);
    erp.stockIn(p.id, 3, "Delivery");
    expect(erp.load().products[0]?.qty).toBe(11);
  });

  it("after the trial still signs in and opens every app it had, to view", () => {
    recordedDuringTrial();
    endedTrial();
    store.signIn();
    expect(store.signedIn()).toBe(true);
    for (const app of APPS) expect(canOpen(store.get(), app.tier)).toBe(true);
    expect(canRecord(store.get())).toBe(false);
    expect(erp.load().sales).toHaveLength(1);
    expect(erp.load().customers.map((c) => c.name)).toEqual(["Wanjiru"]);
  });

  it("after the trial can still export every record: spreadsheets and the backup file", () => {
    recordedDuringTrial();
    endedTrial();
    const s = erp.load();
    const rows = Object.fromEntries(SHEETS.map((sheet) => [sheet.name, sheet.rows(s).length]));
    expect(rows["Products"]).toBe(1);
    expect(Object.values(rows).reduce((a, b) => a + b, 0)).toBeGreaterThan(2);
    expect(JSON.parse(backupJson("Duka")).data.sales).toHaveLength(1);
  });

  it("after the trial refuses every new transaction and every change, and keeps the records and the upload queue exactly as they were", () => {
    const p = recordedDuringTrial();
    endedTrial();
    const before = saved(), queued = getOutbox().length, sale = erp.load().sales[0]!;
    const attempts: [string, () => unknown][] = [
      ["sale", () => erp.confirmSale({ cart: [{ productId: p.id, qty: 1 }], discount: 0, pay: cash(5), channel: "POS" })],
      ["customer", () => erp.addCustomer("Otieno")],
      ["product", () => erp.addProduct({ name: "Salt", buy: 1, sell: 2, qty: 1 } as Parameters<typeof erp.addProduct>[0])],
      ["stock in", () => erp.stockIn(p.id, 1, "x")],
      ["stock out", () => erp.stockOut(p.id, 1, "x")],
      ["edit a product", () => erp.updateProduct(p.id, { sell: 9 })],
      ["cash event", () => erp.cashEvent("CASH IN", 5)],
      ["return", () => erp.returnSale(sale.id, [{ productId: p.id, qty: 1 }], "cash")],
      ["any commit", () => erp.commit((s) => { s.sales = []; })],
      ["a saved transaction", () => erp.runErpTransaction(() => erp.addCustomer("Batch"))],
      ["restore", () => restoreJson(backupJson("Duka"))],
    ];
    for (const [what, attempt] of attempts) expect(attempt, what).toThrow(READ_ONLY_MESSAGE);
    expect(saved()).toBe(before);
    expect(getOutbox()).toHaveLength(queued);
  });

  it("an import preview still works out what would change and saves nothing", () => {
    recordedDuringTrial();
    endedTrial();
    const before = saved();
    const preview = erp.runErpTransaction(() => { erp.addCustomer("Preview"); return erp.load().customers.length; }, false);
    expect(preview).toBe(2);
    expect(saved()).toBe(before);
  });

  it("subscribing is still open, and a confirmed payment brings recording back with nothing lost", async () => {
    const p = recordedDuringTrial();
    endedTrial();
    const result = await buyPlan("growth", "monthly", async () => ({ ok: true, reference: "mock-payment-reference", test: false }));
    expect(result.ok).toBe(true);
    expect(canRecord(store.get())).toBe(true);
    erp.confirmSale({ cart: [{ productId: p.id, qty: 1 }], discount: 0, pay: cash(5), channel: "POS" });
    expect(erp.load().sales).toHaveLength(2);
  });

  it("a refused payment changes nothing: still read-only", async () => {
    recordedDuringTrial();
    endedTrial();
    expect((await buyPlan("growth", "monthly", async () => ({ ok: false, error: "Declined" }))).ok).toBe(false);
    expect(canRecord(store.get())).toBe(false);
  });
});

describe("waiting uploads after the trial (offline before it ended)", () => {
  it("are held on the device: not sent, not deleted, and the owner is told", async () => {
    recordedDuringTrial(); // these changes are still waiting to be uploaded
    endedTrial();
    store.signIn();
    const waiting = getOutbox().filter((o) => o.phase !== "synced").map((o) => o.id);
    expect(waiting.length).toBeGreaterThan(0);
    server.getUser.mockResolvedValue({ data: { user: { id: "owner-1" } }, error: null });
    const status = new Promise<void>((done) => window.addEventListener("shopbook-sync-status", () => done(), { once: true }));
    const stop = startShopSync();
    await status; await new Promise((r) => setTimeout(r, 20));
    stop();
    expect(server.applyOperation).not.toHaveBeenCalled();
    expect(getOutbox().filter((o) => o.phase !== "synced").map((o) => o.id)).toEqual(waiting);
    expect(HELD).toMatch(/kept here and will be sent after you subscribe/);
  });

  it("an employee's offline sales stay queued and unsent once the server says the trial has ended", async () => {
    localStorage.setItem("shopbook.account", JSON.stringify({ shopName: "Town", email: "", currency: "KES", password: "", role: "staff", staff: { memberId: "m1", fullName: "Amina", role: "shopkeeper", permissions: ["sales.process"], businesses: [], locations: [], writable: true } }));
    localStorage.setItem("shopbook.erp", JSON.stringify({ ...erp.empty(), products: [{ id: "p1", name: "Sugar", buy: 0, sell: 2, qty: 10, createdAt: 1 }] }));
    erp.confirmSale({ cart: [{ productId: "p1", qty: 1 }], discount: 0, pay: cash(2), channel: "POS" });
    const a = store.get()!;
    store.save({ ...a, staff: { ...a.staff!, writable: false } });
    await sendStaffQueue();
    expect(server.staffRecord).not.toHaveBeenCalled();
    expect(getOutbox().map((o) => o.phase)).toEqual(["pending"]);
    expect(() => erp.confirmSale({ cart: [{ productId: "p1", qty: 1 }], discount: 0, pay: cash(2), channel: "POS" })).toThrow(/employer's free trial has ended/);
    expect(getOutbox()).toHaveLength(1);
    expect(erp.load().sales).toHaveLength(1);
  });
});

// ---------- The server: the same rules, enforced where no device can change them ----------
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
let db: PGlite, nextOp = 500;
async function as<T = Record<string, unknown>>(user: string | null, sql: string, params: unknown[] = [], role = "authenticated") {
  await db.exec(`RESET ROLE; SELECT set_config('test.uid', '${user ?? ""}', false), set_config('test.email', '${user}@x.co', false), set_config('test.role', '${role}', false); SET ROLE ${role}`);
  try { return (await db.query<T>(sql, params)).rows; } finally { await db.exec("RESET ROLE"); }
}
const sale = (id: string) => ({ collection: "sales", id, before: null, after: { id, ref: id, at: 1, items: [], subtotal: 5, discount: 0, total: 5, pay: cash(5), cashier: "A", channel: "POS" } });
const upload = (user: string, changes: unknown[], op = uuid(nextOp++)) => as(user, "SELECT apply_shopbook_operation($1, $2, 'b1', 'TEST', $3::jsonb, '{}'::jsonb) r", [op, uuid(900), JSON.stringify(changes)]);
const sales = async (user: string) => (await db.query<{ n: number }>("SELECT coalesce(jsonb_array_length(payload->'sales'), 0) n FROM shopbook_shop_sync WHERE user_id = $1", [user])).rows[0]?.n ?? 0;
const access = async (user: string) => (await as<{ a: Record<string, unknown> }>(user, "SELECT my_access() a"))[0]!.a;
const endTrial = (account: string) => db.query("UPDATE owner_subscriptions SET trial_ends_at = now() - interval '1 day' WHERE owner_account_id = $1", [account]);

/** An owner on the 30-day trial the server started, with one shop and one employee who may sell there. */
async function trialBusiness(n: number) {
  const user = uuid(n);
  const c = (await as<{ c: { account: string; business: string } }>(user, "SELECT connect_owner($1, 'Owner', $2, $1, 'KES') c", [`Shop ${n}`, `legacy-${n}`]))[0]!.c;
  const shop = (await as<{ id: string }>(user, "SELECT sync_location($1, 'loc-main', 'Main', 'SHOP-001', 'shop', true) id", [c.business]))[0]!.id;
  const login = (await as<{ member_id: string; token: string }>(user, "SELECT member_id, token FROM create_login($1, 'emp', 'Amina', $4, NULL, NULL, 'shopkeeper', $2::uuid[], $3::uuid[])", [c.account, [c.business], [shop], `0712${String(100000 + n)}`]))[0]!;
  const staff = uuid(n + 50);
  await as(null, "SELECT finish_invitation($1, $2)", [login.token, staff], "service_role");
  await upload(user, [sale(`s-${n}`)]);
  return { user, staff, member: login.member_id, shop, ...c };
}
const staffSale = (b: { member: string }, id: string) => as(null, "SELECT apply_member_operation($1, $2, $3, 'STAFF SALE', $4::jsonb, '{}'::jsonb)", [b.member, uuid(nextOp++), uuid(901), JSON.stringify([sale(id)])], "service_role");

describe("on the server (migration 0014)", () => {
  beforeEach(async () => { db = new PGlite(); await applyChain(db); }, 60000);

  it("during the trial: the owner's device and the employee both record, and the employee is writable", async () => {
    const b = await trialBusiness(1);
    await staffSale(b, "s-staff");
    expect(await sales(b.user)).toBe(2);
    expect(await access(b.staff)).toMatchObject({ kind: "member", writable: true, subscription: "trial" });
  });

  it("after the trial: every upload is refused and nothing stored changes, from the owner's device, the employee path or a direct write", async () => {
    const b = await trialBusiness(2);
    await endTrial(b.account);
    await expect(upload(b.user, [sale("late")])).rejects.toThrow(/SUBSCRIPTION_INACTIVE/);
    await expect(staffSale(b, "late-staff")).rejects.toThrow(/SUBSCRIPTION_INACTIVE/);
    await expect(as(b.user, "UPDATE shopbook_shop_sync SET payload = '{}' WHERE user_id = $1", [b.user])).rejects.toThrow(/permission denied/);
    await expect(as(null, "UPDATE shopbook_shop_sync SET payload = '{}' WHERE user_id = $1", [b.user], "service_role")).rejects.toThrow(/SUBSCRIPTION_INACTIVE/);
    // Editing or deleting an existing sale is the same kind of upload.
    const stored = (await db.query<{ s: unknown }>("SELECT payload->'sales'->0 s FROM shopbook_shop_sync WHERE user_id = $1", [b.user])).rows[0]!.s;
    await expect(upload(b.user, [{ collection: "sales", id: "s-2", before: stored, after: null }])).rejects.toThrow(/SUBSCRIPTION_INACTIVE/);
    expect(await sales(b.user)).toBe(1);
  });

  it("after the trial: the owner still reads their records, and an upload that was already accepted is still acknowledged", async () => {
    const b = await trialBusiness(3);
    const op = uuid(777), changes = [sale("before-end")];
    await upload(b.user, changes, op);
    await endTrial(b.account);
    expect(await upload(b.user, changes, op)).toHaveLength(1); // the retry of an applied operation writes nothing
    expect((await as<{ n: number }>(b.user, "SELECT jsonb_array_length(payload->'sales') n FROM shopbook_shop_sync WHERE user_id = $1", [b.user]))[0]!.n).toBe(2);
  });

  it("after the trial: the employee still signs in with the same role, permissions and locations, read-only", async () => {
    const b = await trialBusiness(4);
    const during = await access(b.staff);
    await endTrial(b.account);
    const after = await access(b.staff);
    expect(after).toMatchObject({ kind: "member", writable: false, role: "shopkeeper" });
    expect(after["permissions"]).toEqual(during["permissions"]);
    expect(after["locations"]).toEqual(during["locations"]);
    expect(after["businesses"]).toEqual(during["businesses"]);
  });

  it("the end of a trial never opens another business: each owner and employee still sees only their own", async () => {
    const a = await trialBusiness(5), other = await trialBusiness(6);
    await endTrial(a.account);
    const see = async (user: string, business: string) => (await as<{ ok: boolean }>(user, "SELECT can_see_business($1) ok", [business]))[0]!.ok;
    expect(await see(a.staff, a.business)).toBe(true);
    expect(await see(a.staff, other.business)).toBe(false);
    expect(await see(a.user, other.business)).toBe(false);
    // Who may read another owner's synced records directly is the live table's own row security, which is not in this repository
    // (migration-chain.ts builds a stand-in without it), so it can't be checked here. 0014 doesn't change it.
    expect((await access(a.staff))["account"]).toBe(a.account);
  });

  it("other ended subscriptions stay blocked, as before", async () => {
    const b = await trialBusiness(7);
    await db.query("UPDATE owner_subscriptions SET status = 'cancelled' WHERE owner_account_id = $1", [b.account]);
    expect(await access(b.staff)).toEqual({ kind: "blocked", reason: "subscription" });
  });

  it("a verified payment brings writes back for the owner and the employee", async () => {
    const b = await trialBusiness(8);
    await endTrial(b.account);
    await expect(upload(b.user, [sale("x")])).rejects.toThrow(/SUBSCRIPTION_INACTIVE/);
    // Only the service role can record a verified payment; an owner can't make themselves paid.
    await expect(as(b.user, "SELECT apply_verified_subscription($1, 'growth', 'monthly', now() + interval '30 days', 'self')", [b.account])).rejects.toThrow(/permission denied/);
    await as(null, "SELECT apply_verified_subscription($1, 'growth', 'monthly', now() + interval '30 days', 'pay-1')", [b.account], "service_role");
    await upload(b.user, [sale("paid")]);
    await staffSale(b, "paid-staff");
    expect(await sales(b.user)).toBe(3);
    expect(await access(b.staff)).toMatchObject({ kind: "member", writable: true });
  });

  it("an owner with no account on the server yet is counted from their first upload", async () => {
    const user = uuid(40);
    await upload(user, [sale("first")]);
    await upload(user, [sale("day-2")]);
    await db.query("UPDATE shopbook_sync_operations SET acknowledged_at = now() - interval '31 days' WHERE user_id = $1", [user]);
    await expect(upload(user, [sale("day-31")])).rejects.toThrow(/SUBSCRIPTION_INACTIVE/);
    expect(await sales(user)).toBe(2);
  });
});
