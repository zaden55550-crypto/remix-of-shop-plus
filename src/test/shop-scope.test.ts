// Each shop has its own stock, prices, customers, money and records, and an employee's copy holds only their shop's.
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { useShopErp } from "@/components/shopbook/product-search";
import * as erp from "@/lib/erp";
import { addExpense, confirmPurchase, floatBalances, floatDeposit } from "@/lib/finance";
import { MAIN_LOCATION, saveLocation } from "@/lib/locations";
import { scopeToShop } from "@/lib/shop-scope";
import { filterForStaff, moduleKey } from "@/lib/staff-access";

const cash = (n: number) => ({ cash: n, mpesa: 0, bank: 0, credit: 0 });
const credit = (n: number) => ({ cash: 0, mpesa: 0, bank: 0, credit: n });
const sell = (productId: string, qty = 1, total = 0) => erp.confirmSale({ cart: [{ productId, qty }], discount: 0, pay: cash(total), channel: "POS" });

/** Sugar: 10 in the main shop, 4 sent to Town, and Town charges 2 where the main shop charges 5. */
function twoShops() {
  const town = saveLocation({ name: "Town", type: "shop" }), far = saveLocation({ name: "Far", type: "shop" });
  const p = erp.addProduct({ name: "Sugar", buy: 1, sell: 5, qty: 14 } as Parameters<typeof erp.addProduct>[0]);
  const t = erp.createTransfer(p.id, 4, "Town", "Main");
  erp.sendTransfer(t.id);
  erp.selectShop(town.id);
  erp.receiveTransfer(t.id);
  erp.setShopPrice(p.id, town.id, 2);
  return { town, far, p };
}
const stock = (id: string, shop: string) => { const s = erp.load(); return erp.shopStock(s, s.products.find((x) => x.id === id)!, shop); };

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("shopbook.account", JSON.stringify({ shopName: "Main", email: "o@x.co", currency: "KES", password: "x", plan: "business" }));
});

describe("a shop's stock and prices", () => {
  it("a sale takes the shop's own stock at the shop's own price, and the product total stays right", () => {
    const { town, p } = twoShops();
    expect(stock(p.id, town.id)).toBe(4);
    expect(stock(p.id, MAIN_LOCATION)).toBe(10);
    const sale = sell(p.id, 3, 6);
    expect(sale).toMatchObject({ total: 6, locationId: town.id });
    expect(stock(p.id, town.id)).toBe(1);
    expect(stock(p.id, MAIN_LOCATION)).toBe(10);
    expect(erp.load().products[0]?.qty).toBe(11);
  });

  it("a shop can't sell more than it holds, whatever the others have", () => {
    const { p } = twoShops();
    expect(() => sell(p.id, 5, 10)).toThrow(/Insufficient stock.*available 4/);
    erp.selectShop(null);
    expect(() => sell(p.id, 11, 55)).toThrow(/Insufficient stock.*available 10/);
  });

  it("three shops can charge 5, 5 and 2", () => {
    const { town, far, p } = twoShops();
    const product = erp.load().products[0]!;
    expect([MAIN_LOCATION, far.id, town.id].map((id) => erp.shopPrice(product, id))).toEqual([5, 5, 2]);
    erp.setShopPrice(p.id, town.id, null);
    expect(erp.load().products[0]?.prices).toBeUndefined();
  });

  it("editing the price inside a shop changes only that shop's", () => {
    const { far, p } = twoShops();
    erp.selectShop(far.id);
    erp.updateProduct(p.id, { sell: 7 });
    const product = erp.load().products[0]!;
    expect(product.sell).toBe(5);
    expect(product.prices?.[far.id]).toBe(7);
  });

  it("a stock count compares against this shop's stock only", () => {
    const { town, p } = twoShops();
    erp.adjustStock(p.id, 3, "Count");
    expect(stock(p.id, town.id)).toBe(3);
    expect(stock(p.id, MAIN_LOCATION)).toBe(10);
  });

  it("a purchase arrives at the shop that bought it", () => {
    const { town, p } = twoShops();
    floatDeposit("cash", 100, "DEPOSIT", "Start");
    const pur = confirmPurchase({ lines: [{ productId: p.id, qty: 5, cost: 1 }], pay: cash(5), updateCost: false });
    expect(pur.locationId).toBe(town.id);
    expect(stock(p.id, town.id)).toBe(9);
  });

  it("a shop with no other locations behaves exactly as before, with nothing tagged", () => {
    const p = erp.addProduct({ name: "Tea", buy: 1, sell: 5, qty: 3 } as Parameters<typeof erp.addProduct>[0]);
    const c = erp.addCustomer("Asha");
    sell(p.id, 1, 5);
    const s = erp.load();
    for (const row of [...s.movements, ...s.sales, ...s.payments, ...s.audit, c]) expect(row.locationId).toBeUndefined();
  });
});

describe("a shop's own products", () => {
  const add = (name: string, extra = {}) => erp.addProduct({ name, buy: 1, sell: 5, qty: 1, ...extra } as Parameters<typeof erp.addProduct>[0]);
  const names = (shop: string) => scopeToShop(erp.load(), shop).products.map((p) => p.name).sort();

  it("a shop sees only the products it created", () => {
    const town = saveLocation({ name: "Town", type: "shop" }), far = saveLocation({ name: "Far", type: "shop" });
    add("Main Tea");
    erp.selectShop(town.id);
    expect(add("Town Soap").locationId).toBe(town.id);
    erp.selectShop(far.id);
    add("Far Rice");
    expect(names(MAIN_LOCATION)).toEqual(["Main Tea"]);
    expect(names(town.id)).toEqual(["Town Soap"]);
    expect(names(far.id)).toEqual(["Far Rice"]);
    expect(erp.load().products).toHaveLength(3);
  });

  it("a product appears at another shop only once stock has arrived there", () => {
    const town = saveLocation({ name: "Town", type: "shop" });
    const p = add("Main Tea", { qty: 5 });
    const t = erp.createTransfer(p.id, 2, "Town", "Main");
    erp.sendTransfer(t.id);
    expect(names(town.id)).toEqual([]);
    erp.receiveTransfer(t.id);
    expect(names(town.id)).toEqual(["Main Tea"]);
    expect(scopeToShop(erp.load(), town.id).products[0]?.qty).toBe(2);
  });

  it("two shops can use the same barcode and SKU, but one shop can't use them twice", () => {
    const town = saveLocation({ name: "Town", type: "shop" });
    const own = add("Main Tea", { barcode: "123", sku: "T1" });
    erp.selectShop(town.id);
    const theirs = add("Town Tea", { barcode: "123", sku: "t1" });
    expect(() => add("Town Other", { barcode: "123" })).toThrow(/Barcode already used/);
    expect(() => add("Town Other", { sku: "T1" })).toThrow(/SKU already used/);
    erp.updateProduct(theirs.id, { name: "Town Tea 2" });
    erp.selectShop(null);
    erp.updateProduct(own.id, { name: "Main Tea 2" });
    erp.updateProduct(theirs.id, { name: "Town Tea 3" }); // Edited from All Shops, it is still checked against its own shop.
  });

  it("an employee's copy holds only their shop's products", () => {
    const town = saveLocation({ name: "Town", type: "shop" });
    add("Main Tea");
    erp.selectShop(town.id);
    add("Town Soap");
    const copy = filterForStaff(erp.load(), { permissions: [moduleKey("pos", "view")], locationRefs: [town.id] });
    expect(copy.products.map((p) => p.name)).toEqual(["Town Soap"]);
    expect(JSON.stringify(copy)).not.toContain("Main Tea");
  });
});

describe("a shop's customers and money", () => {
  it("customers belong to the shop that added them, and can't be sold to from another", () => {
    const { town, far, p } = twoShops();
    const c = erp.addCustomer("Asha");
    expect(c.locationId).toBe(town.id);
    erp.selectShop(far.id);
    erp.stockIn(p.id, 2, "Delivery");
    expect(() => erp.confirmSale({ cart: [{ productId: p.id, qty: 1 }], discount: 0, pay: credit(5), customerId: c.id, channel: "Sales" })).toThrow(/belongs to Town/);
    expect(() => erp.receiveDebt(c.id, 1, "cash")).toThrow(/belongs to Town/);
    expect(scopeToShop(erp.load(), far.id).customers).toEqual([]);
    expect(scopeToShop(erp.load(), town.id).customers.map((x) => x.name)).toEqual(["Asha"]);
  });

  it("each shop has its own drawer and can't spend another's money", () => {
    const { town, far, p } = twoShops();
    sell(p.id, 2, 4);
    expect(erp.cashSession(erp.load()).expected).toBe(4);
    expect(() => addExpense({ category: "Rent", amount: 9, method: "cash" })).toThrow(/Not enough cash/);
    erp.selectShop(far.id);
    expect(erp.cashSession(erp.load()).expected).toBe(0);
    expect(() => addExpense({ category: "Rent", amount: 1, method: "cash" })).toThrow(/Not enough cash/);
    expect(floatBalances(scopeToShop(erp.load(), town.id)).cash).toBe(4);
    expect(floatBalances(scopeToShop(erp.load(), far.id)).cash).toBe(0);
  });

  it("a return goes back through the shop that made the sale, and its stock returns there", () => {
    const { town, far, p } = twoShops();
    const sale = sell(p.id, 2, 4);
    erp.selectShop(far.id);
    expect(() => erp.returnSale(sale.id, [{ productId: p.id, qty: 1 }], "cash")).toThrow(/belongs to Town/);
    erp.selectShop(town.id);
    erp.returnSale(sale.id, [{ productId: p.id, qty: 1 }], "cash");
    expect(stock(p.id, town.id)).toBe(3);
    expect(erp.load().returns[0]?.locationId).toBe(town.id);
  });
});

describe("what a Shop 2 employee receives", () => {
  const everything = ["sales", "pos", "inventory", "contacts", "expenses", "float", "payroll", "purchases"].map((m) => moduleKey(m, "view")).concat(["finance.view_balances", "salary.view", "audit.view", "products.view_buying_price"]);
  /** Records at both shops, with figures that would stand out if they leaked. */
  function business() {
    const { town, far, p } = twoShops();
    erp.addCustomer("Town Customer");
    sell(p.id, 1, 2);
    erp.selectShop(far.id);
    erp.addCustomer("Far Customer");
    erp.selectShop(null);
    erp.addCustomer("Main Customer");
    sell(p.id, 2, 10);
    return { town, far, p, s: erp.load() };
  }

  it("is only that shop's records, with that shop's stock and price", () => {
    const { town, s } = business();
    const copy = filterForStaff(s, { permissions: everything, locationRefs: [town.id] });
    expect(copy.customers.map((c) => c.name)).toEqual(["Town Customer"]);
    expect(copy.sales.map((x) => x.total)).toEqual([2]);
    expect(copy.payments.map((x) => x.amount)).toEqual([2]);
    expect(copy.products[0]).toMatchObject({ qty: 3, sell: 2 });
    expect(copy.products[0]?.prices).toBeUndefined();
    expect(copy.locations.map((l) => l.id)).toEqual([town.id]);
    expect(copy.audit.every((a) => a.locationId === town.id)).toBe(true);
  });

  it("can't work out the other shops' stock from a movement's before and after", () => {
    const { town, s } = business();
    const rows = filterForStaff(s, { permissions: everything, locationRefs: [town.id] }).movements;
    expect(rows.every((m) => m.locationId === town.id)).toBe(true);
    expect(rows[0]).toMatchObject({ type: "SALE", prev: 4, next: 3 });
    expect(Math.max(...rows.map((m) => m.next))).toBe(4);
  });

  it("the main shop's employee doesn't get the other shops' records either", () => {
    const { s } = business();
    const copy = filterForStaff(s, { permissions: everything, locationRefs: [MAIN_LOCATION] });
    expect(copy.customers.map((c) => c.name)).toEqual(["Main Customer"]);
    expect(copy.sales.map((x) => x.total)).toEqual([10]);
    expect(copy.products[0]).toMatchObject({ qty: 8, sell: 5 });
  });

  it("someone at two shops gets one at a time, and only one of theirs", () => {
    const { town, far, s } = business();
    const of = (activeRef?: string) => filterForStaff(s, { permissions: everything, locationRefs: [town.id, far.id], activeRef }).customers.map((c) => c.name);
    expect(of(far.id)).toEqual(["Far Customer"]);
    expect(of(town.id)).toEqual(["Town Customer"]);
    expect(of(MAIN_LOCATION)).toEqual(["Town Customer"]); // Not theirs, so it is ignored.
  });

  it("a login with no location gets no shop's records; a manager with none works across the business", () => {
    const { s } = business();
    const none = filterForStaff(s, { permissions: everything, locationRefs: [], role: "shopkeeper" });
    expect(none.sales).toEqual([]);
    expect(none.customers).toEqual([]);
    expect(none.products).toEqual([]);
    expect(filterForStaff(s, { permissions: everything, locationRefs: [], role: "manager" }).sales).toHaveLength(2);
    expect(filterForStaff(s, { permissions: everything, locationRefs: [MAIN_LOCATION], role: "manager" }).sales).toHaveLength(1);
  });

  it("a supplier shows only what this shop owes them", () => {
    const { town, p, s: _s } = business();
    void _s;
    const sup = erp.commit((s) => { const row: erp.Supplier = { id: "sup", name: "Mill", balance: 100, createdAt: 1 }; s.suppliers.push(row); return row; });
    erp.selectShop(town.id);
    confirmPurchase({ lines: [{ productId: p.id, qty: 3, cost: 1 }], pay: credit(3), supplierId: sup.id, updateCost: false });
    const s = erp.load();
    expect(s.suppliers[0]?.balance).toBe(103);
    expect(filterForStaff(s, { permissions: everything, locationRefs: [town.id] }).suppliers[0]?.balance).toBe(3);
    expect(filterForStaff(s, { permissions: everything, locationRefs: [MAIN_LOCATION] }).suppliers[0]?.balance).toBe(100);
  });
});

describe("an owner choosing a shop", () => {
  it("shows only that shop, and never changes what is saved", () => {
    const { town } = twoShops();
    const before = JSON.stringify(erp.load());
    expect(scopeToShop(erp.load(), town.id).products[0]).toMatchObject({ qty: 4, sell: 2 });
    expect(JSON.stringify(erp.load())).toBe(before);
    expect(erp.load().products[0]).toMatchObject({ qty: 14, sell: 5 });
  });

  it("every app screen follows the choice, and a till always shows one shop", () => {
    const { town } = twoShops();
    erp.selectShop(null);
    const screen = renderHook(() => useShopErp()), till = renderHook(() => useShopErp(true));
    expect(screen.result.current.products[0]).toMatchObject({ qty: 14, sell: 5 });
    expect(till.result.current.products[0]).toMatchObject({ qty: 10, sell: 5 });
    act(() => erp.selectShop(town.id));
    expect(screen.result.current.products[0]).toMatchObject({ qty: 4, sell: 2 });
    expect(till.result.current.products[0]).toMatchObject({ qty: 4, sell: 2 });
  });

  it("forgets a shop that was archived or removed, and goes back to all shops", () => {
    const { town } = twoShops();
    expect(erp.selectedShop(erp.load())).toBe(town.id);
    expect(erp.selectedShop({ locations: [] })).toBeNull();
    expect(erp.activeShop({ locations: [] })).toBe(MAIN_LOCATION);
  });
});
