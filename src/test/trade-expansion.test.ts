// Trade expansion (2026-11-20): the 25 Trade types with General Trade as the skipped type, several types per business, the
// feature switches the types start with, counters within the plan (Basic 1, Growth 10 in total, Business 10 per shop) with a
// drawer per counter, and batches with expiry dates worked out from the movements (earliest expiry sold first).
import { beforeEach, describe, expect, it } from "vitest";
import * as erp from "@/lib/erp";
import { activateSetup, draftTypes, validate, type SetupDraft, type SetupRow } from "@/lib/business-setup";
import { businessProblem, cleanDetails } from "@/lib/business-rules";
import { BUSINESS_TYPES, GENERAL_TRADE, businessTypesForFamily, industryIsOpen } from "@/lib/industry-config";
import { requirementsOf, IMPLEMENTED_APPS } from "@/lib/app-requirements";
import { currentFeatures, defaultFeatures, placeName, saveFeatures, sellingPlaceName } from "@/lib/trade-features";
import { counterLimit, loginAllowance, planCounterLine, PLANS } from "@/lib/shopbook";
import { saveLocation } from "@/lib/locations";
import { readSettings } from "@/lib/settings-config";
import { expiringStock, expirySummary, productBatches, writeOffBatch } from "@/lib/batches";
import { addSupplier, confirmPurchase } from "@/lib/finance";

const account = (plan: string, extra = {}) => {
  localStorage.setItem("shopbook.account", JSON.stringify({ shopName: "Mama Njeri", email: "m@example.com", currency: "KES", password: "x", plan, trialStart: Date.now(), businessId: "biz-1", ...extra }));
  localStorage.setItem("shopbook.session", "1");
};
const row = (key: string, name: string): SetupRow => ({ key, type: "shop", name, code: "" });
const draft = (extra: Partial<SetupDraft> = {}): SetupDraft => ({ businessName: "Mama Njeri Supermarket", businessType: "", otherType: "", extraBusinessTypes: [], industryFamilyId: "trade", rows: [row("a", "Main")], users: [], ...extra });
const product = (name: string, qty = 0) => erp.addProduct({ name, buy: 10, sell: 15, qty, unit: "Piece" });
const pay = (cash: number) => ({ cash, mpesa: 0, bank: 0, credit: 0 });

beforeEach(() => { localStorage.clear(); account("business"); });

describe("Trade types", () => {
  it("has 25 Trade types, the 10 new ones included, each opening all 13 apps", () => {
    const trade = businessTypesForFamily("trade").map((t) => t.name);
    expect(trade).toHaveLength(25);
    for (const t of ["Agrovet", "Butchery", "Wines & Spirits", "Mobile Phones & Accessories", "Shoe Shop", "Mitumba (Second-hand Clothes)", "Gas / LPG Dealer", "Cereals & Grains Shop", "Mini-mart / Kiosk", GENERAL_TRADE]) {
      expect(trade).toContain(t);
      expect(requirementsOf(t)?.apps).toEqual(IMPLEMENTED_APPS);
    }
    expect(BUSINESS_TYPES).toHaveLength(111);
  });
  it("only Trade can be chosen for a new business", () => {
    expect(industryIsOpen("trade")).toBe(true);
    for (const id of ["manufacturing", "hospitality", "services", "property-construction", "logistics", "education", "healthcare"]) expect(industryIsOpen(id)).toBe(false);
  });
  it("a Trade business with no type is General Trade; several types keep their order with the main one first", () => {
    expect(draftTypes(draft())).toEqual([GENERAL_TRADE]);
    expect(validate(draft(), 1, 1, 0, [], []).filter((p) => p.field === "businessType")).toEqual([]);
    const many = draft({ businessType: "Supermarket", extraBusinessTypes: ["Butchery", "Wines & Spirits", "Pharmacy"] });
    expect(draftTypes(many)).toEqual(["Supermarket", "Butchery", "Wines & Spirits", "Pharmacy"]);
    expect(validate(many, 1, 1, 0, [], []).filter((p) => p.field === "businessType")).toEqual([]);
    // Another industry still needs its type.
    expect(validate(draft({ industryFamilyId: "healthcare" }), 1, 1, 0, [], []).some((p) => p.field === "businessType")).toBe(true);
  });
  it("a new business may hold several types of its industry, never one from another", () => {
    const base = { name: "Duka Two", industryFamilyId: "trade", businessType: "", phone: "+254700000001", country: "KEN", currency: "KES" };
    expect(cleanDetails(base).businessTypes).toEqual([GENERAL_TRADE]);
    expect(businessProblem({ ...base, businessType: "Supermarket", businessTypes: ["Supermarket", "Butchery"] })).toBeNull();
    expect(businessProblem({ ...base, businessType: "Supermarket", businessTypes: ["Supermarket", "Hotel"] })).toBe("That business type is not part of the chosen industry");
  });
});

describe("location names and logins", () => {
  it("a selling place is named after the main type; other types keep Shop", () => {
    expect(sellingPlaceName(["Supermarket", "Butchery"])).toBe("Supermarket");
    expect(sellingPlaceName(["Pharmacy"])).toBe("Pharmacy");
    expect(sellingPlaceName(["Hardware Shop"])).toBe("Hardware Shop");
    expect(sellingPlaceName([GENERAL_TRADE])).toBe("Shop");
    expect(sellingPlaceName([])).toBe("Shop");
  });
  it("each shop row keeps its own type: full names, a few shortened, General Trade is Shop", () => {
    expect(["Supermarket", "Butchery", "Wholesale Business", "Mitumba (Second-hand Clothes)", "Mini-mart / Kiosk", "Shoe Shop", GENERAL_TRADE, undefined].map(placeName))
      .toEqual(["Supermarket", "Butchery", "Wholesale", "Mitumba", "Mini-mart", "Shoe Shop", "Shop", "Shop"]);
    activateSetup(draft({ businessType: "Supermarket", extraBusinessTypes: ["Butchery"], rows: [
      { key: "a", type: "shop", name: "Main", code: "", savedId: erp.MAIN_LOCATION },
      { key: "b", type: "shop", name: "Meat Corner", code: "", placeType: "Butchery" },
    ] }));
    const shops = erp.load().locations.filter((l) => l.type === "shop");
    expect(shops.find((l) => l.name === "Meat Corner")?.placeType).toBe("Butchery");
    expect(shops.find((l) => l.name === "Main")?.placeType).toBeUndefined();
  });
  it("Setup saves the business's two phone numbers; a wrong number is refused", () => {
    expect(validate(draft({ phone: "12", phone2: "+254 711 000 222" }), 1, 1, 0, [], []).map((p) => p.field)).toContain("phone");
    activateSetup(draft({ phone: "+254 700 000 111", phone2: "+254 711 000 222", rows: [{ key: "a", type: "shop", name: "Main", code: "", savedId: erp.MAIN_LOCATION }] }));
    expect(JSON.parse(localStorage.getItem("shopbook.account")!)).toMatchObject({ phone: "+254 700 000 111", phone2: "+254 711 000 222" });
  });
  it("Setup saves the Tax PIN in the business's settings and each location's address", () => {
    activateSetup(draft({ taxPin: "p051234567x", rows: [{ key: "a", type: "shop", name: "Main", code: "", savedId: erp.MAIN_LOCATION, address: "Moi Avenue, Nairobi" }] }));
    expect(readSettings().taxPin).toBe("P051234567X");
    expect(erp.load().locations.find((l) => l.id === erp.MAIN_LOCATION)?.address).toBe("Moi Avenue, Nairobi");
  });
  it("logins are one pool: Basic 2, Growth 12, Business 24, whatever the locations", () => {
    expect([loginAllowance({ plan: "basic" }).total, loginAllowance({ plan: "growth" }).total, loginAllowance({ plan: "business" }).total]).toEqual([2, 12, 24]);
    expect(loginAllowance({ plan: "business" }, { shops: 1, stores: 0, warehouses: 0 })).toMatchObject({ total: 24, staff: 20, managers: 3 });
  });
});

describe("counters per person", () => {
  it("an employee's device offers only the counters chosen for them; others get every counter", () => {
    saveLocation({ id: erp.MAIN_LOCATION, name: "Main", type: "shop", counters: 5 });
    const s = erp.load();
    expect(erp.allowedCounters(s, erp.MAIN_LOCATION)).toEqual([1, 2, 3, 4, 5]);
    const me = { id: "e1", memberId: "m1", name: "Jane", role: "shopkeeper", comp: "salary" as const, salary: 0, rule: { kind: "none" as const, value: 0, paidOnly: false }, active: true, createdAt: 1, counters: { [erp.MAIN_LOCATION]: [2, 3] } };
    localStorage.setItem("shopbook.account", JSON.stringify({ ...JSON.parse(localStorage.getItem("shopbook.account")!), staff: { memberId: "m1", fullName: "Jane", role: "shopkeeper", permissions: [], businesses: [], locations: [] } }));
    const copy = { ...s, employees: [me] };
    expect(erp.allowedCounters(copy, erp.MAIN_LOCATION)).toEqual([2, 3]);
    expect(erp.activeCounter(copy)).toBe(2);
  });
});

describe("feature switches", () => {
  it("start from the types and keep what the owner changed", () => {
    expect(defaultFeatures(["Pharmacy"])).toMatchObject({ expiry: true, counters: false });
    expect(defaultFeatures(["Supermarket"])).toMatchObject({ expiry: true, counters: true });
    expect(defaultFeatures(["Hardware Shop"])).toMatchObject({ expiry: false, counters: false });
    expect(defaultFeatures(["Hardware Shop", "Butchery"]).expiry).toBe(true);
    saveFeatures({ expiry: false });
    expect(currentFeatures(["Pharmacy"]).expiry).toBe(false);
    expect(currentFeatures(["Supermarket"]).counters).toBe(true);
  });
});

describe("counters", () => {
  it("plans allow 1, 10 in total, and 10 per shop", () => {
    expect(PLANS.map((p) => [p.id, p.counters, p.countersPerShop])).toEqual([["basic", 1, false], ["growth", 10, false], ["business", 10, true]]);
    expect(PLANS.map(planCounterLine)).toEqual(["1 Counter", "Up to 10 Counters", "Up to 10 Counters per Shop"]);
    expect(counterLimit({ plan: "trial" })).toEqual({ max: 10, perShop: true });
  });
  it("Basic refuses a second counter; Growth shares 10 across shops; Business allows 10 at each shop", () => {
    account("basic");
    expect(() => saveLocation({ id: erp.MAIN_LOCATION, name: "Main", type: "shop", counters: 2 })).toThrow(/allows 1 counter/);
    account("growth");
    saveLocation({ id: erp.MAIN_LOCATION, name: "Main", type: "shop", counters: 8 });
    expect(() => saveLocation({ name: "Town", type: "shop", counters: 3 })).toThrow(/up to 10 counters in total/);
    const town = saveLocation({ name: "Town", type: "shop", counters: 2 });
    expect(town.counters).toBe(2);
    account("business");
    saveLocation({ id: erp.MAIN_LOCATION, name: "Main", type: "shop", counters: 10 });
    saveLocation({ id: town.id, name: "Town", type: "shop", counters: 10 });
    expect(() => saveLocation({ id: town.id, name: "Town", type: "shop", counters: 11 })).toThrow(/10 counters at each shop/);
    // A smaller plan never blocks an edit that doesn't add counters.
    account("basic");
    expect(saveLocation({ id: town.id, name: "Town Centre", type: "shop" }).counters).toBe(10);
  });
  it("each counter has its own drawer; a sale carries its counter", () => {
    saveLocation({ id: erp.MAIN_LOCATION, name: "Main", type: "shop", counters: 3 });
    const p = product("Sugar 1kg", 10);
    erp.cashEvent("OPENING", 1000);
    erp.selectCounter(erp.MAIN_LOCATION, 2);
    expect(erp.activeCounter(erp.load())).toBe(2);
    erp.cashEvent("OPENING", 500);
    const sale = erp.confirmSale({ cart: [{ productId: p.id, qty: 2 }], discount: 0, pay: pay(30), channel: "POS" });
    expect(sale.counter).toBe(2);
    const s = erp.load();
    expect(s.payments.find((x) => x.source === sale.ref)?.counter).toBe(2);
    expect(erp.cashSession(s, 2)).toMatchObject({ opening: 500, sales: 30, expected: 530 });
    expect(erp.cashSession(s, 1)).toMatchObject({ opening: 1000, sales: 0, expected: 1000 });
    erp.cashUp(530);
    expect(erp.load().cash[0]).toMatchObject({ type: "CASH UP", counter: 2, expected: 530 });
    expect(erp.cashSession(erp.load(), 1).expected).toBe(1000);
    // Back at counter 1, records are untagged exactly as before.
    erp.selectCounter(erp.MAIN_LOCATION, 1);
    const again = erp.confirmSale({ cart: [{ productId: p.id, qty: 1 }], discount: 0, pay: pay(15), channel: "POS" });
    expect(again.counter).toBeUndefined();
  });
  it("a one-counter shop records exactly as before", () => {
    const p = product("Salt", 5);
    erp.selectCounter(erp.MAIN_LOCATION, 4); // not a counter this shop has
    expect(erp.activeCounter(erp.load())).toBe(1);
    const sale = erp.confirmSale({ cart: [{ productId: p.id, qty: 1 }], discount: 0, pay: pay(15), channel: "POS" });
    expect(sale.counter).toBeUndefined();
    expect(erp.load().payments.some((x) => "counter" in x)).toBe(false);
  });
});

describe("batches and expiry", () => {
  const today = "2026-11-20";
  it("sells the earliest expiry first and lists what expires soon", () => {
    const p = product("Panadol");
    erp.stockIn(p.id, 10, "Received", undefined, undefined, { batch: "A1", expiry: "2026-12-01" });
    erp.stockIn(p.id, 10, "Received", undefined, undefined, { batch: "B2", expiry: "2027-06-01" });
    const sold = erp.confirmSale({ cart: [{ productId: p.id, qty: 4 }], discount: 0, pay: pay(60), channel: "POS" });
    expect(sold.ref).toBeTruthy();
    expect(productBatches(erp.load(), erp.load().products.find((x) => x.id === p.id)!)).toEqual([{ batch: "A1", expiry: "2026-12-01", qty: 6 }, { batch: "B2", expiry: "2027-06-01", qty: 10 }]);
    const soon = expiringStock(erp.load(), 30, today);
    expect(soon).toHaveLength(1);
    expect(soon[0]).toMatchObject({ name: "Panadol", batch: "A1", qty: 6, daysLeft: 11, value: 60 });
    expect(expirySummary(erp.load(), 30, "2026-12-05")).toMatchObject({ expired: 1, soon: 0 });
  });
  it("a write-off takes that batch out as a Stock Out with its lot", () => {
    const p = product("Milk");
    erp.stockIn(p.id, 5, "Received", undefined, undefined, { batch: "M", expiry: "2026-11-01" });
    erp.stockIn(p.id, 3, "Received");
    expect(writeOffBatch(p.id, "M", "2026-11-01")).toBe(5);
    const s = erp.load(), m = s.movements[0]!;
    expect(m).toMatchObject({ type: "STOCK OUT", qty: -5, reason: "Expired", batch: "M", expiry: "2026-11-01" });
    expect(s.products.find((x) => x.id === p.id)!.qty).toBe(3);
    expect(expiringStock(s, 365, today)).toEqual([]);
    expect(() => writeOffBatch(p.id, "M", "2026-11-01")).toThrow(/no stock left/);
  });
  it("a purchase line keeps its batch and expiry; a wrong date is refused", () => {
    const p = product("Seeds");
    const sup = addSupplier("Agro Ltd");
    const pur = confirmPurchase({ lines: [{ productId: p.id, qty: 4, cost: 10, batch: "S-9", expiry: "2027-01-31" }], pay: { cash: 0, mpesa: 0, bank: 0, credit: 40 }, supplierId: sup.id, updateCost: false });
    expect(pur.items[0]).toMatchObject({ batch: "S-9", expiry: "2027-01-31" });
    expect(erp.load().movements[0]).toMatchObject({ type: "PURCHASE", batch: "S-9", expiry: "2027-01-31" });
    expect(() => erp.stockIn(p.id, 1, "Received", undefined, undefined, { expiry: "2027-02-30" })).toThrow(/valid expiry date/);
  });
});
