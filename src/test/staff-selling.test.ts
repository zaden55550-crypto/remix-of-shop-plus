// An employee sells on their own device, online or offline, and the server records it against the owner's real records through the real database functions.
import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import * as erp from "@/lib/erp";
import { MAIN_LOCATION, saveLocation } from "@/lib/locations";
import { getOutbox, type Operation } from "@/lib/outbox";
import { buildStaffChange } from "@/lib/staff-record";
import { filterForStaff, moduleKey } from "@/lib/staff-access";
import { applyChain } from "./migration-chain";

const OWNER = "00000000-0000-4000-8000-000000000001", ACCOUNT = "00000000-0000-4000-8000-000000000002", MEMBER = "00000000-0000-4000-8000-000000000003", DEVICE = "00000000-0000-4000-8000-000000000004";
const cash = (n: number) => ({ cash: n, mpesa: 0, bank: 0, credit: 0 });
const credit = (n: number) => ({ cash: 0, mpesa: 0, bank: 0, credit: n });
const shopkeeper = ["sales", "pos"].map((m) => moduleKey(m, "view")).concat("sales.process");
const OWNER_ACCOUNT = JSON.stringify({ shopName: "Main", email: "o@x.co", currency: "KES", password: "x", plan: "business" });

/** Owner's records: Sugar 10 at Town at price 2, 20 at the main shop at price 5. */
function ownerRecords() {
  localStorage.clear();
  localStorage.setItem("shopbook.account", OWNER_ACCOUNT);
  const town = saveLocation({ name: "Town", type: "shop" });
  const p = erp.addProduct({ name: "Sugar", buy: 1, sell: 5, qty: 30 } as Parameters<typeof erp.addProduct>[0]);
  const t = erp.createTransfer(p.id, 10, "Town", "Main");
  erp.sendTransfer(t.id); erp.receiveTransfer(t.id);
  erp.setShopPrice(p.id, town.id, 2);
  return { town, p, s: erp.load() };
}
/** Turns this test's device into the employee's, holding the server-filtered copy. */
function employeeDevice(s: erp.ErpState, town: string, permissions = shopkeeper) {
  localStorage.clear();
  localStorage.setItem("shopbook.account", JSON.stringify({ shopName: "Town", email: "", currency: "KES", password: "", role: "staff", staff: { memberId: MEMBER, fullName: "Amina", role: "shopkeeper", permissions, businesses: [], locations: [{ id: "srv-town", name: "Town", kind: "shop", businessId: "b", erpRef: town }], activeLocationId: "srv-town" } }));
  localStorage.setItem("shopbook.erp", JSON.stringify(filterForStaff(s, { permissions, locationRefs: [town] })));
}
const queued = () => getOutbox().filter((o) => o.intent) as (Operation & { intent: erp.StaffIntent })[];

describe("on the employee's device", () => {
  it("a sale shows at once and waits to be sent, with no connection needed", () => {
    const { town, p, s } = ownerRecords();
    employeeDevice(s, town.id);
    const sale = erp.confirmSale({ cart: [{ productId: p.id, qty: 3 }], discount: 0, pay: cash(6), channel: "POS" });
    expect(sale).toMatchObject({ total: 6, cashier: "Amina", locationId: town.id, ref: erp.staffSaleRef(queued()[0]!.id) });
    expect(erp.load().products[0]?.qty).toBe(7);
    expect(erp.load().sales).toHaveLength(1);
    expect(queued()).toHaveLength(1);
    expect(queued()[0]).toMatchObject({ phase: "pending", changes: [] });
  });

  it("can't sell more than their shop holds, and nothing is queued", () => {
    const { town, p, s } = ownerRecords();
    employeeDevice(s, town.id);
    expect(() => erp.confirmSale({ cart: [{ productId: p.id, qty: 11 }], discount: 0, pay: cash(22), channel: "POS" })).toThrow(/Insufficient stock.*available 10/);
    expect(queued()).toEqual([]);
  });

  it("a login without the sales permission can't record", () => {
    const { town, p, s } = ownerRecords();
    employeeDevice(s, town.id, ["module.sales.view"]);
    expect(() => erp.confirmSale({ cart: [{ productId: p.id, qty: 1 }], discount: 0, pay: cash(2), channel: "POS" })).toThrow(/can't record sales/);
  });

  it("everything else still refuses", () => {
    const { town, p, s } = ownerRecords();
    employeeDevice(s, town.id);
    expect(() => erp.stockIn(p.id, 1, "x")).toThrow(/Ask your manager/);
    expect(() => erp.updateProduct(p.id, { sell: 1 })).toThrow(/Ask your manager/);
    expect(() => erp.cashEvent("CASH IN", 5)).toThrow(/Ask your manager/);
  });
});

describe("recorded by the server", () => {
  let db: PGlite;
  const apply = async (op: string, change: ReturnType<typeof buildStaffChange>) => {
    await db.exec("RESET ROLE; SET ROLE service_role");
    try { return await db.query("SELECT public.apply_member_operation($1,$2,$3,$4,$5::jsonb,$6::jsonb)", [MEMBER, op, DEVICE, change.kind, JSON.stringify(change.changes), JSON.stringify(change.seq)]); }
    finally { await db.exec("RESET ROLE"); }
  };
  const stored = async () => (await db.query<{ payload: erp.ErpState }>("SELECT payload FROM public.shopbook_shop_sync WHERE user_id = $1", [OWNER])).rows[0]!.payload;
  const by = (shop: string) => ({ shop, user: "Amina" });

  beforeEach(async () => {
    db = new PGlite();
    await applyChain(db);
  });
  /** The owner's records go up through their own sync, as they do in real use. */
  async function ownerOnServer(s: erp.ErpState) {
    const changes = Object.entries(s).flatMap(([collection, rows]) => (Array.isArray(rows) ? rows.map((r: { id: string }) => ({ collection, id: r.id, before: null, after: r })) : []));
    await db.exec(`SELECT set_config('test.uid','${OWNER}',false); SET ROLE authenticated`);
    await db.query("SELECT public.apply_shopbook_operation($1,$2,'b1','EXISTING RECORDS',$3::jsonb,$4::jsonb)", ["00000000-0000-4000-8000-000000000010", DEVICE, JSON.stringify(changes), JSON.stringify(s.seq)]);
    await db.exec("RESET ROLE");
    await db.exec(`SET session_replication_role = replica;
      INSERT INTO public.owner_accounts (id, owner_user_id, name) VALUES ('${ACCOUNT}', '${OWNER}', 'Biz');
      INSERT INTO public.owner_members (id, owner_account_id, full_name, email, role, status) VALUES ('${MEMBER}', '${ACCOUNT}', 'Amina', 'a@x.co', 'shopkeeper', 'active');
      SET session_replication_role = DEFAULT;`);
  }

  it("takes the sale from the shop's real stock at the real price and cost, under the employee's name", async () => {
    const { town, p, s } = ownerRecords();
    await ownerOnServer(s);
    const op = "00000000-0000-4000-8000-000000000020";
    const change = buildStaffChange(await stored(), op, { type: "sale", at: Date.now(), input: { cart: [{ productId: p.id, qty: 3 }], discount: 0, pay: cash(6), channel: "POS" } }, by(town.id));
    expect(change.refused).toBeNull();
    await apply(op, change);
    const r = await stored();
    expect(r.sales[r.sales.length - 1]).toMatchObject({ id: op, ref: erp.staffSaleRef(op), total: 6, cashier: "Amina", locationId: town.id });
    expect(r.sales[r.sales.length - 1]?.items[0]?.cost).toBe(1);
    expect(r.products[0]?.qty).toBe(27);
    expect(erp.shopStock(r, r.products[0]!, town.id)).toBe(7);
    expect(erp.shopStock(r, r.products[0]!, MAIN_LOCATION)).toBe(20);
  });

  it("sending the same sale twice records it once", async () => {
    const { town, p, s } = ownerRecords();
    await ownerOnServer(s);
    const op = "00000000-0000-4000-8000-000000000021";
    const intent: erp.StaffIntent = { type: "sale", at: Date.now(), input: { cart: [{ productId: p.id, qty: 1 }], discount: 0, pay: cash(2), channel: "POS" } };
    const change = buildStaffChange(await stored(), op, intent, by(town.id));
    await apply(op, change);
    await apply(op, change);
    const r = await stored();
    expect(r.sales).toHaveLength(1);
    expect(r.products[0]?.qty).toBe(29);
    // Worked out again on the newer records, it finds the sale already there and changes nothing.
    expect(buildStaffChange(r, op, intent, by(town.id)).changes).toEqual([]);
  });

  it("two employees selling the last items offline: the second is refused, kept out of the books, and shows in the audit", async () => {
    const { town, p, s } = ownerRecords();
    await ownerOnServer(s);
    const sell = (qty: number): erp.StaffIntent => ({ type: "sale", at: Date.now(), input: { cart: [{ productId: p.id, qty }], discount: 0, pay: cash(qty * 2), channel: "POS" } });
    const a = "00000000-0000-4000-8000-000000000022", b = "00000000-0000-4000-8000-000000000023";
    await apply(a, buildStaffChange(await stored(), a, sell(8), by(town.id)));
    const second = buildStaffChange(await stored(), b, sell(8), by(town.id));
    expect(second.refused).toMatch(/Insufficient stock.*available 2/);
    await apply(b, second);
    const r = await stored();
    expect(r.sales).toHaveLength(1);
    expect(r.audit.some((x) => x.action === "STAFF REFUSED" && x.user === "Amina" && x.locationId === town.id)).toBe(true);
  });

  it("a new customer made offline and a credit sale to them both arrive, at that shop", async () => {
    const { town, p, s } = ownerRecords();
    await ownerOnServer(s);
    const c = "00000000-0000-4000-8000-000000000024", sale = "00000000-0000-4000-8000-000000000025";
    await apply(c, buildStaffChange(await stored(), c, { type: "customer", at: Date.now(), name: "Asha" }, by(town.id)));
    await apply(sale, buildStaffChange(await stored(), sale, { type: "sale", at: Date.now(), input: { cart: [{ productId: p.id, qty: 1 }], discount: 0, pay: credit(2), customerId: c, channel: "Sales" } }, by(town.id)));
    const r = await stored();
    expect(r.customers.find((x) => x.id === c)).toMatchObject({ locationId: town.id, balance: 2 });
  });

  it("a device can't sell another shop's customer or spend its stock", async () => {
    const { town, p, s } = ownerRecords();
    localStorage.setItem("shopbook.activeShop", MAIN_LOCATION);
    const mains = erp.addCustomer("Main Customer");
    await ownerOnServer(erp.load());
    void s;
    const op = "00000000-0000-4000-8000-000000000026";
    const change = buildStaffChange(await stored(), op, { type: "sale", at: Date.now(), input: { cart: [{ productId: p.id, qty: 1 }], discount: 0, pay: credit(2), customerId: mains.id, channel: "Sales" } }, by(town.id));
    expect(change.refused).toMatch(/belongs to/);
  });

  it("a login that isn't active is refused by the database itself", async () => {
    const { town, p, s } = ownerRecords();
    await ownerOnServer(s);
    await db.exec(`UPDATE public.owner_members SET status = 'suspended' WHERE id = '${MEMBER}'`);
    const op = "00000000-0000-4000-8000-000000000027";
    const change = buildStaffChange(await stored(), op, { type: "sale", at: Date.now(), input: { cart: [{ productId: p.id, qty: 1 }], discount: 0, pay: cash(2), channel: "POS" } }, by(town.id));
    await expect(apply(op, change)).rejects.toThrow(/Not allowed/);
    expect((await stored()).sales ?? []).toEqual([]);
  });

  it("nobody but the server can call it", async () => {
    await db.exec(`SELECT set_config('test.uid','${OWNER}',false); SET ROLE authenticated`);
    await expect(db.query("SELECT public.apply_member_operation($1,$2,$3,'X','[]'::jsonb,'{}'::jsonb)", [MEMBER, "00000000-0000-4000-8000-000000000028", DEVICE])).rejects.toThrow(/permission denied/);
    await expect(db.query("SELECT public.apply_shopbook_operation_for($1,$2,$3,'b','X','[]'::jsonb,'{}'::jsonb)", [OWNER, "00000000-0000-4000-8000-000000000029", DEVICE])).rejects.toThrow(/permission denied/);
    await db.exec("RESET ROLE");
  });
});
