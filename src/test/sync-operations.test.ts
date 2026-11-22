// Every kind of ERP action, made by the real engine and outbox, sent in order through the real sync function on a real
// PostgreSQL engine (PGlite), with every migration applied in deployment order (migration-chain.ts).
import { PGlite } from "@electric-sql/pglite";
import { beforeEach, describe, expect, it } from "vitest";
import * as erp from "@/lib/erp";
import { saveCatalogItem, saveUnit } from "@/lib/catalog";
import { loadDemoData } from "@/lib/demo";
import { addExpense, addMoneyAccount, addSupplier, confirmPurchase, floatDeposit, floatTransfer, payExpense, payPurchase, paySupplier, moveMoneyAccount, renameMoneyAccount, returnPurchase, setMoneyAccountActive, setMoneyAccountCategory } from "@/lib/finance";
import { saveLocation } from "@/lib/locations";
import { getOutbox, persistErp, type Operation } from "@/lib/outbox";
import { cancelOrder, cancelPurchase, receiveOrder, recordSupplierPayment, saveInvoice, saveOrder, sendOrder } from "@/lib/purchasing";
import { resetData } from "@/lib/reset-data";
import { applyChain } from "./migration-chain";
import { createBusiness } from "@/lib/businesses";
import { businessTypesForFamily } from "@/lib/industry-config";
import { addSerials, removeSerial } from "@/lib/serials";
import { applyPriceLevels } from "@/lib/price-levels";
import { addGasCylinder, refundCylinderDeposit, sendEmpties } from "@/lib/gas";

const OWNER = "00000000-0000-4000-8000-000000000001";

let db: PGlite;
async function send(op: Pick<Operation, "id" | "device" | "business" | "kind" | "changes" | "seq">) {
  await db.exec(`RESET ROLE; SELECT set_config('test.uid','${OWNER}',false); SET ROLE authenticated`);
  try { await db.query("SELECT public.apply_shopbook_operation($1,$2,$3,$4,$5::jsonb,$6::jsonb)", [op.id, op.device, op.business, op.kind, JSON.stringify(op.changes), JSON.stringify(op.seq)]); }
  finally { await db.exec("RESET ROLE"); }
}
/** Sends the whole queue in order, as the real coordinator does, and returns what the server refused. */
async function flush() {
  const refused: string[] = [];
  for (const op of getOutbox().filter((o) => o.phase !== "synced")) {
    try { await send(op); } catch (e) { refused.push(`${op.kind}: ${(e as Error).message}`); }
  }
  const raw = JSON.parse(localStorage.getItem("shopbook.erp") || "{}");
  raw.__outbox = []; localStorage.setItem("shopbook.erp", JSON.stringify(raw));
  return refused;
}
const server = async () => (await db.query<{ payload: erp.ErpState }>("SELECT payload FROM public.shopbook_shop_sync WHERE user_id = $1", [OWNER])).rows[0]?.payload;
const pay = (cash = 0, credit = 0) => ({ cash, mpesa: 0, bank: 0, credit });

beforeEach(async () => {
  localStorage.clear();
  localStorage.setItem("shopbook.account", JSON.stringify({ shopName: "T", email: "t@x.co", password: "p", currency: "KES", plan: "business", businessId: "b1" }));
  localStorage.setItem("shopbook.syncInitialized", "1");
  db = new PGlite();
  await applyChain(db);
});

describe("server sync accepts what the engine produces", () => {
  it("takes gas cylinders: refills, new cylinders with deposit, deposits paid back and empties sent (Trade feature 4)", async () => {
    const k = addGasCylinder({ brand: "K-Gas", size: 13, refillPrice: 3200, deposit: 3000, refillCost: 2700, full: 10, empty: 2 });
    const t = addGasCylinder({ brand: "Total", size: 13, refillPrice: 3300, deposit: 3200, full: 4 });
    erp.confirmSale({ cart: [{ productId: k.fullId, qty: 1, gas: { mode: "refill", emptyId: t.emptyId } }], discount: 0, pay: pay(3200), channel: "POS" });
    erp.confirmSale({ cart: [{ productId: k.fullId, qty: 1, price: 6200, priceReason: "Includes cylinder deposit", gas: { mode: "new" } }], discount: 0, pay: pay(6200), channel: "POS" });
    refundCylinderDeposit(k.emptyId, 1, "cash");
    sendEmpties(k.emptyId, 2, "Kenol");
    expect(await flush()).toEqual([]);
    const remote = await server();
    const q = (id: string) => remote?.products.find((p) => p.id === id)?.qty;
    expect([q(k.fullId), q(k.emptyId), q(t.emptyId)]).toEqual([8, 1, 1]);
    expect(remote?.sales.map((x) => x.items[0]?.gas)).toEqual(expect.arrayContaining([{ mode: "new", deposit: 3000 }, { mode: "refill", emptyId: t.emptyId }]));
    expect(remote?.payments.some((p) => p.kind === "REFUND" && p.source.startsWith("CYL") && p.amount === -3000)).toBe(true);
  });

  it("takes serial / IMEI tracking, wholesale prices and weighed sales (Trade features 1-3)", async () => {
    const phone = erp.addProduct({ name: "Samsung A15", buy: 15000, sell: 18000, qty: 3, unit: "pcs", serialTracked: true, warrantyMonths: 12 });
    addSerials(phone.id, ["356938035643801", "356938035643802", "356938035643803", "TYPO"]);
    removeSerial(phone.id, "TYPO");
    const soda = erp.addProduct({ name: "Soda", buy: 40, sell: 60, qty: 24, unit: "pcs", wholesale: { price: 50, from: 6 } });
    const beef = erp.addProduct({ name: "Beef", buy: 500, sell: 700, qty: 10, unit: "kg" });
    const cart = applyPriceLevels(erp.load(), [{ productId: phone.id, qty: 1, serials: ["356938035643801"] }, { productId: soda.id, qty: 6 }, { productId: beef.id, qty: 1.25 }], true);
    const sale = erp.confirmSale({ cart, discount: 0, pay: pay(18000 + 300 + 875), channel: "POS" });
    erp.returnSale(sale.id, [{ productId: phone.id, qty: 1 }], "cash");
    expect(await flush()).toEqual([]);
    const remote = await server();
    const items = remote?.sales[0]?.items ?? [];
    expect(items.find((i) => i.productId === phone.id)).toMatchObject({ serials: ["356938035643801"] });
    expect(items.find((i) => i.productId === soda.id)).toMatchObject({ price: 50, wholesale: true });
    expect(items.find((i) => i.productId === beef.id)).toMatchObject({ qty: 1.25, unit: "kg" });
    const remotePhone = remote?.products.find((p) => p.id === phone.id);
    expect(remotePhone?.serials?.map((u) => u.code)).toEqual(["356938035643801", "356938035643802", "356938035643803"]);
    expect(remotePhone?.serials?.every((u) => !u.sold)).toBe(true);
    expect(remote?.products.find((p) => p.id === soda.id)?.wholesale).toEqual({ price: 50, from: 6 });
  });

  it("takes every kind of ERP action, in order, and ends with the same records as the device", async () => {
    const p = erp.addProduct({ name: "A", buy: 5, sell: 10, qty: 100, unit: "pcs" });
    const kg = erp.addProduct({ name: "Sugar", buy: 90.5, sell: 120.25, qty: 7.5, unit: "kg" });
    erp.stockIn(p.id, 5, "Found"); erp.stockOut(p.id, 1, "Damaged"); erp.adjustStock(p.id, 100, "Count");
    const t = erp.createTransfer(p.id, 2, "Branch", "Main"); erp.sendTransfer(t.id); erp.receiveTransfer(t.id);
    const t2 = erp.createTransfer(p.id, 1, "Branch", "Main"); erp.sendTransfer(t2.id); erp.cancelTransfer(t2.id);
    saveCatalogItem("categories", { name: "Food" }); saveUnit({ name: "Sack", abbr: "sk", type: "quantity" });
    saveLocation({ name: "Town", type: "shop" });
    const cust = erp.addCustomer("Cust"), sup = addSupplier("Sup");
    const cart = [{ productId: p.id, qty: 3 }, { productId: kg.id, qty: 0.333 }];
    const owed = Math.round((erp.lineTotal(erp.load(), cart) - 1.15) * 100) / 100;
    const sale = erp.confirmSale({ cart, discount: 1.15, pay: pay(0, owed), customerId: cust.id, channel: "POS" });
    erp.paySale(sale.id, 9.1, "cash"); erp.receiveDebt(cust.id, 10, "cash");
    erp.confirmSale({ cart: [{ productId: p.id, qty: 1 }], discount: 0, pay: pay(10), channel: "Sales" });
    erp.returnSale(sale.id, [{ productId: p.id, qty: 1 }], "cash");
    floatDeposit("cash", 5000, "DEPOSIT", "Owner"); floatTransfer("cash", "bank", 100);
    const bought = confirmPurchase({ lines: [{ productId: p.id, qty: 10, cost: 5 }], pay: pay(20, 30), supplierId: sup.id, updateCost: false });
    payPurchase(bought.id, 10, "cash"); paySupplier(sup.id, 5, "cash");
    returnPurchase(bought.id, [{ productId: p.id, qty: 1 }], "credit", "Bad");
    const other = confirmPurchase({ lines: [{ productId: p.id, qty: 2, cost: 5 }], pay: pay(10), updateCost: false });
    cancelPurchase(other.id, "Wrong", "cash");
    const order = saveOrder({ supplierId: sup.id, at: Date.now(), lines: [{ productId: p.id, qty: 4, cost: 5 }] });
    sendOrder(order.id); receiveOrder(order.id, [{ productId: p.id, qty: 2 }], pay(10));
    const order2 = saveOrder({ supplierId: sup.id, at: Date.now(), lines: [{ productId: p.id, qty: 1, cost: 5 }] }); cancelOrder(order2.id, "No");
    saveInvoice({ number: "INV-1", supplierId: sup.id, purchaseId: bought.id, at: Date.now(), amount: 10 });
    recordSupplierPayment({ supplierId: sup.id, parts: [{ method: "cash", amount: 1 }] });
    const exp = addExpense({ category: "Rent", amount: 100, method: "cash", pay: { cash: 40 } }); payExpense(exp.id, 10, "cash");
    erp.cashEvent("OPENING", 50); erp.cashEvent("CASH IN", 5); erp.cashUp(10, "short");
    const worker = erp.addEmployee({ name: "E", role: "Cashier", comp: "salary+commission", salary: 100, rule: { kind: "percent", value: 5, paidOnly: false } });
    erp.confirmSale({ cart: [{ productId: p.id, qty: 1 }], discount: 0, pay: pay(10), channel: "POS", sellerId: worker.id });
    const run = erp.confirmPayroll(worker.id, 1, 2, 0); erp.payPayroll(run.id, "cash", 5);

    expect(await flush()).toEqual([]);
    const local = erp.load(), remote = await server();
    for (const key of ["products", "movements", "sales", "payments", "purchases", "expenses", "customers", "suppliers", "payrolls"] as const) {
      expect(remote?.[key].map((r) => r.id).sort(), key).toEqual(local[key].map((r) => r.id).sort());
    }
    expect(remote?.products.find((x) => x.id === p.id)?.qty).toBe(local.products.find((x) => x.id === p.id)?.qty);
  });

  it("takes money accounts the owner names, and sales, purchases and expenses paid through them", async () => {
    const airtel = addMoneyAccount("Airtel Money"), tkash = addMoneyAccount("T-Kash");
    const p = erp.addProduct({ name: "A", buy: 5, sell: 10, qty: 50, unit: "pcs" });
    const cust = erp.addCustomer("Cust"), sup = addSupplier("Sup");
    erp.confirmSale({ cart: [{ productId: p.id, qty: 3 }], discount: 0, pay: { cash: 10, mpesa: 0, bank: 0, credit: 0, [airtel.id]: 20 }, channel: "POS" });
    const owing = erp.confirmSale({ cart: [{ productId: p.id, qty: 1 }], discount: 0, pay: { ...pay(0, 10) }, customerId: cust.id, channel: "Sales" });
    erp.paySale(owing.id, 10, airtel.id);
    floatDeposit(tkash.id, 500, "DEPOSIT", "Owner"); floatTransfer(tkash.id, airtel.id, 100);
    confirmPurchase({ lines: [{ productId: p.id, qty: 2, cost: 5 }], pay: { cash: 0, mpesa: 0, bank: 0, credit: 0, [airtel.id]: 10 }, supplierId: sup.id, updateCost: false });
    addExpense({ category: "Rent", amount: 50, method: tkash.id, pay: { [tkash.id]: 50 } });
    renameMoneyAccount(tkash.id, "T-Kash Till");
    floatTransfer(tkash.id, "cash", 350); setMoneyAccountActive(tkash.id, false);
    expect(await flush()).toEqual([]);
    const local = erp.load(), remote = await server();
    for (const key of ["moneyAccounts", "sales", "payments", "purchases", "expenses"] as const) expect(remote?.[key].map((r) => r.id).sort(), key).toEqual(local[key].map((r) => r.id).sort());
    expect(remote?.moneyAccounts.find((a) => a.id === tkash.id)).toMatchObject({ name: "T-Kash Till", active: false });
  });

  it("takes the business's own names, categories, order and disabled state for Cash, M-Pesa and Bank", async () => {
    const card = addMoneyAccount("Card", "card");
    renameMoneyAccount("mpesa", "EVC"); setMoneyAccountCategory("mpesa", "wallet");
    moveMoneyAccount(card.id, -1); setMoneyAccountActive("bank", false);
    expect(await flush()).toEqual([]);
    const local = erp.load(), remote = await server();
    expect(remote?.moneyAccounts.map((r) => r.id).sort()).toEqual(local.moneyAccounts.map((r) => r.id).sort());
    expect(remote?.moneyAccounts.find((a) => a.id === "mpesa")).toMatchObject({ name: "EVC", category: "wallet" });
    expect(remote?.moneyAccounts.find((a) => a.id === "bank")).toMatchObject({ active: false });
    expect(erp.moneyMethods(remote!)).toEqual(erp.moneyMethods(local));
  });

  it("takes one shop's sales, prices, customers and returns, with their location kept", async () => {
    const town = saveLocation({ name: "Town", type: "shop" });
    const p = erp.addProduct({ name: "A", buy: 5, sell: 10, qty: 20, unit: "pcs" });
    const t = erp.createTransfer(p.id, 8, "Town", "T");
    erp.sendTransfer(t.id);
    erp.selectShop(town.id);
    erp.receiveTransfer(t.id);
    erp.setShopPrice(p.id, town.id, 7);
    const c = erp.addCustomer("Asha");
    const sale = erp.confirmSale({ cart: [{ productId: p.id, qty: 3 }], discount: 0, pay: pay(21), customerId: c.id, channel: "POS" });
    erp.returnSale(sale.id, [{ productId: p.id, qty: 1 }], "cash");
    erp.adjustStock(p.id, 5, "Count");
    expect(await flush()).toEqual([]);
    const remote = await server();
    expect(remote?.sales[0]).toMatchObject({ total: 21, locationId: town.id });
    expect(remote?.customers[0]?.locationId).toBe(town.id);
    expect(remote?.returns[0]?.locationId).toBe(town.id);
    expect(remote?.products[0]?.prices?.[town.id]).toBe(7);
    expect(erp.shopStock(remote as erp.ErpState, remote?.products[0] as erp.Product, town.id)).toBe(5);
  });

  it("keeps working after the device takes on the server's copy of the records", async () => {
    const p = erp.addProduct({ name: "A", buy: 0.1, sell: 0.3, qty: 10.1, unit: "kg" });
    erp.confirmSale({ cart: [{ productId: p.id, qty: 0.7 }], discount: 0, pay: pay(0.21), channel: "POS" });
    expect(await flush()).toEqual([]);
    persistErp({ ...erp.empty(), ...(await server()) });
    erp.confirmSale({ cart: [{ productId: p.id, qty: 0.3 }], discount: 0, pay: pay(0.09), channel: "POS" });
    erp.stockIn(p.id, 1.1, "Found");
    expect(await flush()).toEqual([]);
  });

  it("takes the sample data and a later reset", async () => {
    loadDemoData();
    expect(await flush()).toEqual([]);
    resetData(["Sales & returns"], false);
    expect(await flush()).toEqual([]);
    resetData(["Products & stock"], false);
    expect(await flush()).toEqual([]);
    resetData([], true);
    expect(await flush()).toEqual([]);
  });

  it("takes a new business with its first location, a change to its details, and the records made in it (proposed 0019)", async () => {
    const healthcare = businessTypesForFamily("healthcare").map((t) => t.name);
    const details = { name: "Afya Clinic", industryFamilyId: "healthcare", businessType: healthcare[0]!, phone: "+254711000111", email: "clinic@x.co", country: "KEN", currency: "KSH" };
    const b = createBusiness(details, { name: "Clinic Front", type: "shop" });
    erp.updateBusiness(b.id, { ...details, businessType: healthcare[1]! });
    erp.selectBusiness(b.id);
    const p = erp.addProduct({ name: "Paracetamol", buy: 20, sell: 50, qty: 30 });
    erp.confirmSale({ cart: [{ productId: p.id, qty: 2 }], discount: 0, pay: pay(100), channel: "POS" });
    expect(await flush()).toEqual([]);
    const remote = await server(), local = erp.load();
    expect(remote?.businesses).toEqual(local.businesses);
    expect(remote?.locations).toEqual(local.locations);
    expect(remote?.sales.map((x) => [x.businessId, x.locationId])).toEqual([[b.id, local.locations[0]!.id]]);
  });

  it("accepts a shop whose older products have no movement behind their quantity, so its first upload can't be stuck forever", async () => {
    persistErp({ ...erp.empty(), products: [{ id: "old", name: "Old", buy: 1, sell: 2, qty: 12, createdAt: 1 }] });
    await send({ id: "00000000-0000-4000-8000-0000000000b1", device: "00000000-0000-4000-8000-0000000000c1", business: "b1", kind: "EXISTING RECORDS", seq: {}, changes: [{ collection: "products", id: "old", before: null, after: { id: "old", name: "Old", buy: 1, sell: 2, qty: 12, createdAt: 1 } }] });
    erp.confirmSale({ cart: [{ productId: "old", qty: 2 }], discount: 0, pay: pay(4), channel: "POS" });
    expect(await flush()).toEqual([]);
    expect((await server())?.products[0]?.qty).toBe(10);
  });
});

describe("server sync still refuses", () => {
  const product = { id: "p1", name: "P", buy: 10, sell: 20, qty: 10, createdAt: 1 };
  const move = { id: "m1", at: 1, type: "OPENING", productId: "p1", qty: 10, prev: 0, next: 10, user: "A" };
  let n = 1;
  const change = (changes: unknown[], business = "b1") => send({ id: `00000000-0000-4000-8000-${String(n++).padStart(12, "0")}`, device: "00000000-0000-4000-8000-0000000000c1", business, kind: "TEST", seq: {}, changes: changes as Operation["changes"] });
  beforeEach(() => change([{ collection: "products", id: "p1", before: null, after: product }, { collection: "movements", id: "m1", before: null, after: move }]));
  const sale = (over: object) => [{ collection: "sales", id: "s1", before: null, after: { id: "s1", ref: "S-1", at: 1, items: [], subtotal: 5, discount: 0, total: 5, pay: pay(5), cashier: "A", channel: "POS", ...over } }];

  it("a stock change with no movement", () => expect(change([{ collection: "products", id: "p1", before: product, after: { ...product, qty: 99 } }])).rejects.toThrow(/stock change must equal/));
  it("removing or editing a recorded movement", async () => {
    await expect(change([{ collection: "movements", id: "m1", before: move, after: null }])).rejects.toThrow(/Movements can't be changed/);
    await expect(change([{ collection: "movements", id: "m1", before: move, after: { ...move, reason: "edited" } }])).rejects.toThrow(/Movements can't be changed/);
  });
  it("a payment split that isn't the total", () => expect(change(sale({ total: 6 }))).rejects.toThrow(/does not equal total/));
  it("an unknown payment method", () => expect(change(sale({ pay: { ...pay(5), gift: 1 } }))).rejects.toThrow(/Invalid payment split/));
  it("a payment key that only looks like a money account", () => expect(change(sale({ pay: { ...pay(5), "acct-DROP TABLE": 1 } }))).rejects.toThrow(/Invalid payment split/));
  it("credit with no customer", () => expect(change(sale({ pay: pay(0, 5) }))).rejects.toThrow(/Credit requires a customer/));
  it("an out-of-date change from a second device", () => expect(change([{ collection: "products", id: "p1", before: { ...product, qty: 11 }, after: { ...product, qty: 9 } }])).rejects.toThrow(/SYNC_CONFLICT/));
  it("a second business on the same login", () => expect(change([{ collection: "customers", id: "c", before: null, after: { id: "c", name: "C", balance: 0, createdAt: 1 } }], "b2")).rejects.toThrow(/SYNC_CONFLICT/));
});
