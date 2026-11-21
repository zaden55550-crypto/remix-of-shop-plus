// Stores and warehouses hold their own stock, counted from movements. Viewing it changes nothing; only a transfer, dispatched and then received, moves it.
import { beforeEach, describe, expect, it } from "vitest";
import * as erp from "@/lib/erp";
import { connectedShops, locationUsage, saveLocation, storageStock, MAIN_LOCATION } from "@/lib/locations";
import { loginAllowance, type Account } from "@/lib/shopbook";
import { filterForStaff, moduleKey } from "@/lib/staff-access";

const add = () => erp.addProduct({ name: "Sugar", buy: 50, sell: 80, qty: 0 } as Parameters<typeof erp.addProduct>[0]);
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("shopbook.account", JSON.stringify({ shopName: "Main", email: "o@x.co", currency: "KES", password: "x", plan: "growth" }));
});

describe("stock held in a warehouse", () => {
  const setup = () => {
    const w = saveLocation({ name: "Depot", type: "warehouse" }), p = add();
    erp.stockIn(p.id, 8, "Shop delivery");
    erp.stockIn(p.id, 20, "Bulk delivery", undefined, w.id);
    return { w, p };
  };
  const qty = (id: string) => erp.load().products.find((x) => x.id === id)!.qty;

  it("is counted from its movements, and viewing it changes nothing", () => {
    const { w, p } = setup(), before = JSON.stringify(erp.load());
    expect(erp.heldAt(erp.load(), p.id, w.id)).toBe(20);
    expect(storageStock(erp.load())).toMatchObject([{ productId: p.id, qty: 20, location: { name: "Depot" } }]);
    expect(JSON.stringify(erp.load())).toBe(before);
    expect(qty(p.id)).toBe(28);
  });

  it("can't be sold or written off from the shop until it has been transferred", () => {
    const { w, p } = setup();
    erp.stockOut(p.id, 8, "Damaged");
    expect(() => erp.stockOut(p.id, 1, "Damaged")).toThrow(/Transfer the rest/);
    erp.stockOut(p.id, 1, "Damaged", w.id);
    expect(erp.heldAt(erp.load(), p.id, w.id)).toBe(19);
    expect(() => erp.stockOut(p.id, 25, "Damaged", w.id)).toThrow(/Not enough stock/);
  });

  it("moves only at dispatch and receipt, once each, and a cancel puts it back", () => {
    const { w, p } = setup();
    expect(() => erp.createTransfer(p.id, 25, "Main", "Depot")).toThrow(/at Depot/);
    const t = erp.createTransfer(p.id, 5, "Main", "Depot");
    expect(t).toMatchObject({ fromId: w.id, status: "PENDING" });
    expect(erp.heldAt(erp.load(), p.id, w.id)).toBe(20);
    erp.sendTransfer(t.id);
    expect(erp.heldAt(erp.load(), p.id, w.id)).toBe(15);
    expect(qty(p.id)).toBe(23);
    erp.receiveTransfer(t.id);
    expect(qty(p.id)).toBe(28);
    expect(() => erp.receiveTransfer(t.id)).toThrow();
    erp.stockOut(p.id, 13, "Sold elsewhere"); // The 8 already in the shop, plus the 5 just received.
    expect(() => erp.stockOut(p.id, 1, "x")).toThrow(/Transfer the rest/);
    const back = erp.createTransfer(p.id, 4, "Main", "Depot");
    erp.sendTransfer(back.id); erp.cancelTransfer(back.id);
    expect(erp.heldAt(erp.load(), p.id, w.id)).toBe(15);
  });

  it("a transfer into a warehouse counts there only once received", () => {
    const { w, p } = setup();
    const t = erp.createTransfer(p.id, 3, "Depot", "Main");
    erp.sendTransfer(t.id);
    expect(erp.heldAt(erp.load(), p.id, w.id)).toBe(20);
    erp.receiveTransfer(t.id);
    expect(erp.heldAt(erp.load(), p.id, w.id)).toBe(23);
  });

  it("deleting a product writes off what each warehouse holds", () => {
    const { w, p } = setup();
    expect(erp.removeProduct(p.id)).toBe("archived");
    const s = erp.load();
    expect(s.products.find((x) => x.id === p.id)?.qty).toBe(0);
    expect(erp.heldAt(s, p.id, w.id)).toBe(0);
  });

  it("a shop with no store or warehouse behaves exactly as before", () => {
    const p = add();
    erp.stockIn(p.id, 5, "In");
    erp.stockOut(p.id, 5, "Out");
    expect(erp.load().movements.every((m) => m.locationId === undefined)).toBe(true);
    expect(storageStock(erp.load())).toEqual([]);
  });

  it("stock can only be tagged to a store or warehouse", () => {
    const p = add(), shop = saveLocation({ name: "Branch", type: "shop" });
    expect(() => erp.stockIn(p.id, 1, "x", undefined, shop.id)).toThrow(/store or warehouse/);
  });
});

describe("connected warehouses", () => {
  const records = () => {
    const w = saveLocation({ name: "Depot", type: "warehouse" }), far = saveLocation({ name: "Far Store", type: "store" });
    const shop = saveLocation({ name: "Town", type: "shop", connected: [w.id] }), p = add();
    erp.stockIn(p.id, 6, "Bulk", 50, w.id);
    return { w, far, shop, p, s: erp.load() };
  };
  const shopkeeper = [moduleKey("inventory", "view"), moduleKey("sales", "view")];

  it("a shop connects only to stores and warehouses", () => {
    const shop = saveLocation({ name: "A", type: "shop" });
    expect(() => saveLocation({ name: "B", type: "shop", connected: [shop.id] })).toThrow(/only connect/);
    expect(() => saveLocation({ name: "C", type: "shop", connected: [MAIN_LOCATION] })).toThrow(/only connect/);
  });

  it("an authorised employee sees their shop's connected warehouse stock, and no other", () => {
    const { w, far, shop, p, s } = records();
    expect(connectedShops(s, w.id).map((l) => l.name)).toEqual(["Town"]);
    const copy = filterForStaff(s, { permissions: [...shopkeeper, "stock.view_warehouse"], locationRefs: [shop.id] });
    expect(copy.locations.map((l) => l.id).sort()).toEqual([shop.id, w.id].sort());
    expect(copy.locations.some((l) => l.id === far.id)).toBe(false);
    expect(storageStock(copy)).toMatchObject([{ productId: p.id, qty: 6 }]);
    expect(copy.products[0]?.buy).toBe(0); // Quantities only: costs stay hidden.
  });

  it("without the permission, or without Inventory, the warehouse doesn't come through", () => {
    const { w, shop, s } = records();
    expect(filterForStaff(s, { permissions: shopkeeper, locationRefs: [shop.id] }).locations.map((l) => l.id)).not.toContain(w.id);
    expect(filterForStaff(s, { permissions: [moduleKey("sales", "view"), "stock.view_warehouse"], locationRefs: [shop.id] }).locations.map((l) => l.id)).not.toContain(w.id);
  });

  it("an archived warehouse drops out, and a warehouse can't itself be connected", () => {
    const { w, shop } = records();
    saveLocation({ id: w.id, name: "Depot", type: "shop" });
    const s = erp.load();
    expect(filterForStaff(s, { permissions: [...shopkeeper, "stock.view_warehouse"], locationRefs: [shop.id] }).locations.map((l) => l.id)).toEqual([shop.id]);
  });
});

describe("usage on the device", () => {
  it("a change of type is recorded and leaves the plan's login total as it is", () => {
    const a = saveLocation({ name: "Depot", type: "warehouse" });
    expect(locationUsage(erp.load()).logins).toEqual({ total: 12, staff: 10, managers: 1, shopkeepers: 10, storekeepers: 10 });
    saveLocation({ id: a.id, name: "Depot", type: "shop" });
    expect(locationUsage(erp.load()).logins).toEqual({ total: 12, staff: 10, managers: 1, shopkeepers: 10, storekeepers: 10 });
    expect(erp.load().audit.map((x) => x.action)).toContain("LOCATION TYPE CHANGED");
  });

  it("no plan gets the smallest allowance; the trial the largest", () => {
    expect(loginAllowance(null).total).toBe(2);
    expect(loginAllowance({ plan: "trial" } as Account).total).toBe(24);
  });
});
