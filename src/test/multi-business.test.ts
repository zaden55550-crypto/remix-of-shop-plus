// Stage 2: one owner, several independent businesses. The real engine (erp.ts) and storage, with businesses in different
// industries: creating, validating, switching, isolating records, settings and employees' copies, the shared location
// allowance, and an existing Trade business that must keep working.
import { beforeEach, describe, expect, it } from "vitest";
import * as erp from "@/lib/erp";
import { businessSummaries, createBusiness, currentBusiness, openBusiness } from "@/lib/businesses";
import { businessProblem, typeBelongs, typesFor, type BusinessDetails } from "@/lib/business-rules";
import { BUSINESS_TYPES, INDUSTRIES, appsForIndustry, businessTypesForFamily, validateIndustryCatalogue } from "@/lib/industry-config";
import { listLocations, locationUsage, saveLocation } from "@/lib/locations";
import { scopeToBusiness } from "@/lib/shop-scope";
import { filterForStaff, moduleKey } from "@/lib/staff-access";
import { readSettings, saveSettings } from "@/lib/settings-config";
import { forOpenBusiness } from "@/components/shopbook/selling";
import { getOutbox } from "@/lib/outbox";
import { store } from "@/lib/shopbook";

const typeOf = (industry: string, n = 0) => businessTypesForFamily(industry as never)[n]!.name;
const owner = (extra: object = {}) => localStorage.setItem("shopbook.account", JSON.stringify({
  shopName: "Duka Kuu", email: "o@x.co", phone: "+254700000000", currency: "KSH", country: "KEN", password: "x", plan: "business",
  businessTypes: [typeOf("trade")], industryFamilyId: "trade", trialStart: Date.now(), ...extra,
}));
const clinic: BusinessDetails = { name: "Afya Clinic", industryFamilyId: "healthcare", businessType: typeOf("healthcare"), phone: "+254 711 000 111", email: "clinic@x.co", country: "KEN", currency: "KSH" };
const cafe: BusinessDetails = { name: "Kahawa Cafe", industryFamilyId: "hospitality", businessType: typeOf("hospitality"), phone: "0722000222", country: "UGA", currency: "UGX" };
const shopOf = (s: erp.ErpState, business: string) => s.locations.find((l) => l.businessId === business)!;
/** Sells at the product's own price, paid in cash. */
const sale = (productId: string, qty = 1) => {
  const price = erp.load().products.find((p) => p.id === productId)!.sell;
  return erp.confirmSale({ cart: [{ productId, qty }], discount: 0, pay: { cash: price * qty, mpesa: 0, bank: 0, credit: 0 }, channel: "POS" });
};

beforeEach(() => { localStorage.clear(); owner(); });

describe("the approved catalogue", () => {
  it("still holds exactly 8 industries and 111 business types", () => {
    expect(validateIndustryCatalogue()).toEqual([]);
    expect(INDUSTRIES).toHaveLength(8);
    expect(BUSINESS_TYPES).toHaveLength(111);
  });
  it("offers each industry only its own types, and accepts each of the 111 types for its own industry only", () => {
    for (const industry of INDUSTRIES) expect(typesFor(industry.id)).toEqual(businessTypesForFamily(industry.id).map((t) => t.name));
    for (const t of BUSINESS_TYPES) for (const industry of INDUSTRIES) expect(typeBelongs(industry.id, t.name)).toBe(industry.id === t.familyId);
    expect(typesFor("not-an-industry")).toEqual([]);
  });
});

describe("business details", () => {
  it("accepts complete details and refuses each missing or wrong field", () => {
    expect(businessProblem(clinic)).toBeNull();
    expect(businessProblem({ ...clinic, name: "  " })).toBe("Enter a business name");
    expect(businessProblem({ ...clinic, industryFamilyId: "mining" })).toBe("Choose an industry");
    expect(businessProblem({ ...clinic, businessType: "" })).toBe("Choose a business type");
    expect(businessProblem({ ...clinic, phone: "" })).toBe("Enter the business phone number");
    expect(businessProblem({ ...clinic, phone: "12ab" })).toBe("Enter a valid phone number");
    expect(businessProblem({ ...clinic, email: "not-an-email" })).toBe("Enter a valid email address");
    expect(businessProblem({ ...clinic, email: "" })).toBeNull(); // email is optional
    expect(businessProblem({ ...clinic, country: "" })).toBe("Choose a country");
    expect(businessProblem({ ...clinic, currency: "shillings" })).toBe("Choose a currency");
    expect(businessProblem(clinic, ["afya  CLINIC"])).toBe("A business with that name already exists");
  });
  it("never allows a business type from another industry, in the form rules or the engine", () => {
    const wrong = { ...clinic, industryFamilyId: "services", businessType: typeOf("manufacturing") };
    expect(businessProblem(wrong)).toBe("That business type is not part of the chosen industry");
    expect(() => createBusiness(wrong, { name: "Main", type: "shop" })).toThrow("That business type is not part of the chosen industry");
    expect(() => erp.addBusiness(wrong)).toThrow("That business type is not part of the chosen industry");
    expect(erp.load().businesses).toEqual([]);
  });
});

describe("creating a business", () => {
  it("saves the business and its first location together, in one synced operation, without opening it", () => {
    const before = getOutbox().length;
    const b = createBusiness(clinic, { name: "Clinic Front", type: "shop", address: "Moi Avenue" });
    const s = erp.load();
    expect(s.businesses).toEqual([expect.objectContaining({ id: b.id, name: "Afya Clinic", industryFamilyId: "healthcare", businessType: clinic.businessType, phone: "+254 711 000 111", email: "clinic@x.co", country: "KEN", currency: "KSH", active: true })]);
    expect((s.businesses[0] as { businessId?: string }).businessId).toBeUndefined(); // a business row belongs to no other business
    expect(shopOf(s, b.id)).toMatchObject({ name: "Clinic Front", type: "shop", address: "Moi Avenue" });
    const ops = getOutbox().slice(before);
    expect(ops).toHaveLength(1);
    expect(new Set(ops[0]!.changes.map((c) => c.collection))).toEqual(new Set(["businesses", "locations", "audit"]));
    expect(erp.activeBusiness(s)).toBe(erp.MAIN_BUSINESS); // creating doesn't switch
    expect(s.audit.map((a) => a.action)).toContain("BUSINESS CREATED");
  });
  it("persists across a reload of the device's storage", () => {
    const b = createBusiness(clinic, { name: "Clinic Front", type: "shop" });
    const raw = localStorage.getItem("shopbook.erp")!;
    localStorage.setItem("shopbook.erp", raw); // what a reload reads
    expect(erp.listBusinesses(erp.load()).map((x) => x.id)).toEqual([erp.MAIN_BUSINESS, b.id]);
  });
  it("refuses a duplicate name, including the first business's own name", () => {
    createBusiness(clinic, { name: "Clinic Front", type: "shop" });
    expect(() => createBusiness({ ...cafe, name: "afya clinic" }, { name: "Cafe", type: "shop" })).toThrow("A business with that name already exists");
    expect(() => createBusiness({ ...cafe, name: "DUKA KUU" }, { name: "Cafe", type: "shop" })).toThrow("A business with that name already exists");
  });
  it("only the owner can create or change a business; an employee's device can't", () => {
    localStorage.setItem("shopbook.account", JSON.stringify({ shopName: "Duka Kuu", email: "", currency: "KSH", password: "", role: "staff", staff: { memberId: "m1", fullName: "Amina", role: "manager", permissions: [], businesses: [], locations: [] } }));
    expect(() => createBusiness(clinic, { name: "Clinic Front", type: "shop" })).toThrow();
    expect(erp.load().businesses).toEqual([]);
  });
  it("lets two businesses each have a location with the same name, never two in one business", () => {
    const b = createBusiness(clinic, { name: "Main Shop", type: "shop" });
    expect(listLocations(erp.load()).filter((l) => l.name === "Main Shop")).toHaveLength(1);
    expect(() => saveLocation({ name: "main shop", type: "warehouse", businessId: b.id })).toThrow("A location with this name already exists");
  });
});

describe("the plan's location allowance is shared by all the owner's businesses", () => {
  it("counts every business's locations and refuses a business whose first location doesn't fit, saving nothing", () => {
    owner({ plan: "growth" }); // the app's current Growth allowance: 5 locations (see the Stage 2 report for the approved rules)
    for (let i = 1; i <= 4; i++) createBusiness({ ...cafe, name: `Cafe ${i}` }, { name: `Cafe ${i} Shop`, type: "shop" });
    expect(locationUsage(erp.load())).toMatchObject({ active: 5, max: 5 });
    expect(() => createBusiness({ ...cafe, name: "Cafe 5" }, { name: "Cafe 5 Shop", type: "shop" })).toThrow(/Your plan allows 5 active locations/);
    expect(erp.listBusinesses(erp.load())).toHaveLength(5); // the refused business was not kept
  });
  it("on Basic (one location in the app) the first business already fills it", () => {
    owner({ plan: "basic" });
    expect(() => createBusiness(clinic, { name: "Clinic Front", type: "shop" })).toThrow(/Your plan allows 1 active location/);
    expect(erp.load().businesses).toEqual([]);
  });
});

describe("an existing Trade business", () => {
  it("is always listed first and stays the business being worked in, with all its older untagged records", () => {
    const p = erp.addProduct({ name: "Cable", buy: 50, sell: 100, qty: 10 });
    sale(p.id);
    createBusiness(clinic, { name: "Clinic Front", type: "shop" });
    const s = erp.load();
    const list = businessSummaries(s);
    expect(list.map((x) => [x.business.name, x.industry, x.active])).toEqual([["Duka Kuu", "Trade", true], ["Afya Clinic", "Healthcare", false]]);
    expect(list[0]!.locations.map((l) => l.id)).toEqual([erp.MAIN_LOCATION]);
    const main = scopeToBusiness(s, erp.activeBusiness(s));
    expect(main.products.map((x) => x.name)).toEqual(["Cable"]);
    expect(main.sales).toHaveLength(1);
    expect(p.businessId).toBeUndefined(); // nothing was converted
  });
  it("can be reopened after working in another business", () => {
    const b = createBusiness(clinic, { name: "Clinic Front", type: "shop" });
    openBusiness(erp.load(), b.id);
    expect(currentBusiness(erp.load()).business.id).toBe(b.id);
    openBusiness(erp.load(), erp.MAIN_BUSINESS);
    expect(currentBusiness(erp.load()).business.name).toBe("Duka Kuu");
    expect(() => openBusiness(erp.load(), "no-such-business")).toThrow("Business not found");
  });
});

describe("switching businesses", () => {
  it("records into the open business at its own shop, and each business sees only its own records", () => {
    const mainProduct = erp.addProduct({ name: "Cable", buy: 50, sell: 100, qty: 10 });
    sale(mainProduct.id);
    const b = createBusiness(clinic, { name: "Clinic Front", type: "shop" });
    openBusiness(erp.load(), b.id);
    const bShop = shopOf(erp.load(), b.id);
    expect(erp.activeShop(erp.load())).toBe(bShop.id);
    const drug = erp.addProduct({ name: "Paracetamol", buy: 20, sell: 50, qty: 30 });
    sale(drug.id, 2);
    const s = erp.load();
    expect(drug).toMatchObject({ businessId: b.id, locationId: bShop.id });
    expect(s.sales.find((x) => x.businessId === b.id)).toMatchObject({ locationId: bShop.id });

    const inB = scopeToBusiness(s, b.id), inMain = scopeToBusiness(s, erp.MAIN_BUSINESS);
    expect(inB.products.map((x) => x.name)).toEqual(["Paracetamol"]);
    expect(inMain.products.map((x) => x.name)).toEqual(["Cable"]);
    expect(inB.sales.map((x) => x.businessId)).toEqual([b.id]);
    expect(inMain.sales.every((x) => !x.businessId)).toBe(true);
    expect(inB.payments.every((x) => x.businessId === b.id)).toBe(true);
    expect(inMain.payments.some((x) => x.businessId === b.id)).toBe(false);
    // Another business's view never shows the first business's built-in main shop.
    expect(listLocations(inB).map((l) => l.id)).toEqual([bShop.id]);
    expect(listLocations(inMain).map((l) => l.id)).toEqual([erp.MAIN_LOCATION]);
  });
  it("clears the chosen shop, so a shop of one business is never used in another", () => {
    const b = createBusiness(clinic, { name: "Clinic Front", type: "shop" });
    const second = saveLocation({ name: "Duka Branch", type: "shop" });
    erp.selectShop(second.id);
    expect(erp.selectedShop(erp.load())).toBe(second.id);
    openBusiness(erp.load(), b.id);
    expect(localStorage.getItem("shopbook.activeShop")).toBeNull();
    // Even a stale choice left on the device is ignored outside its own business.
    localStorage.setItem("shopbook.activeShop", second.id);
    expect(erp.selectedShop(erp.load())).toBeNull();
    expect(erp.activeShop(erp.load())).toBe(shopOf(erp.load(), b.id).id);
    localStorage.setItem("shopbook.activeShop", erp.MAIN_LOCATION);
    expect(erp.selectedShop(erp.load())).toBeNull();
  });
  it("refuses to change another business's record while working in this one", () => {
    const p = erp.addProduct({ name: "Cable", buy: 50, sell: 100, qty: 10 });
    const s1 = sale(p.id);
    const b = createBusiness(clinic, { name: "Clinic Front", type: "shop" });
    openBusiness(erp.load(), b.id);
    expect(() => erp.returnSale(s1.id, [{ productId: p.id, qty: 1 }], "cash")).toThrow();
  });
  it("shows each business's own identity and industry, and keeps the account's details untouched", () => {
    const b = createBusiness(cafe, { name: "Cafe Shop", type: "shop" });
    openBusiness(erp.load(), b.id);
    const shown = forOpenBusiness(store.get()!);
    expect(shown).toMatchObject({ shopName: "Kahawa Cafe", currency: "UGX", country: "UGA", industryFamilyId: "hospitality", businessType: cafe.businessType });
    expect(shown.logo).toBeUndefined();
    expect(appsForIndustry(shown.industryFamilyId)).not.toEqual(appsForIndustry("trade"));
    expect(store.get()).toMatchObject({ shopName: "Duka Kuu", currency: "KSH", industryFamilyId: "trade" }); // the account is unchanged
    openBusiness(erp.load(), erp.MAIN_BUSINESS);
    expect(forOpenBusiness(store.get()!)).toMatchObject({ shopName: "Duka Kuu", currency: "KSH" });
  });
  it("keeps each business's settings apart, while this device's display sizes stay the same everywhere", () => {
    saveSettings({ taxPin: "P-MAIN", hours: "8-6", textScale: 3 });
    const b = createBusiness(clinic, { name: "Clinic Front", type: "shop" });
    openBusiness(erp.load(), b.id);
    expect(readSettings()).toMatchObject({ taxPin: "", hours: "", textScale: 3 });
    saveSettings({ taxPin: "P-CLINIC", textScale: 4 });
    openBusiness(erp.load(), erp.MAIN_BUSINESS);
    expect(readSettings()).toMatchObject({ taxPin: "P-MAIN", hours: "8-6", textScale: 4 });
    openBusiness(erp.load(), b.id);
    expect(readSettings().taxPin).toBe("P-CLINIC");
  });
});

describe("a business's locations", () => {
  it("stay in their business when edited from any business", () => {
    const b = createBusiness(clinic, { name: "Clinic Front", type: "shop" });
    const loc = shopOf(erp.load(), b.id);
    saveLocation({ id: loc.id, name: "Clinic Reception", type: "shop" }); // edited while the first business is open
    expect(erp.load().locations.find((l) => l.id === loc.id)).toMatchObject({ name: "Clinic Reception", businessId: b.id });
  });
  it("can only connect a shop to its own business's stores and warehouses", () => {
    const b = createBusiness(clinic, { name: "Clinic Store", type: "warehouse" });
    const store_ = shopOf(erp.load(), b.id);
    expect(() => saveLocation({ name: "Duka Branch", type: "shop", connected: [store_.id] })).toThrow("A shop can only connect to a store or warehouse of the same business");
  });
});

describe("an employee's copy (filtered on the server)", () => {
  const everything = ["dashboard", "inventory", "sales", "pos", "purchases", "expenses", "contacts", "payroll", "reports"].map((m) => moduleKey(m, "view"));
  const setUp = () => {
    const p = erp.addProduct({ name: "Cable", buy: 50, sell: 100, qty: 10 });
    sale(p.id);
    const b = createBusiness(clinic, { name: "Clinic Front", type: "shop" });
    openBusiness(erp.load(), b.id);
    const drug = erp.addProduct({ name: "Paracetamol", buy: 20, sell: 50, qty: 30 });
    sale(drug.id);
    return { b, s: erp.load() };
  };
  it("an employee at another business's shop sees that business only", () => {
    const { b, s } = setUp();
    const copy = filterForStaff(s, { permissions: [...everything, "finance.view_balances"], locationRefs: [shopOf(s, b.id).id], role: "cashier" });
    expect(copy.products.map((x) => x.name)).toEqual(["Paracetamol"]);
    expect(copy.sales.every((x) => x.businessId === b.id)).toBe(true);
    expect(copy.locations.map((l) => l.businessId)).toEqual([b.id]);
  });
  it("a manager with no location works in the first business only, never the others", () => {
    const { b, s } = setUp();
    const copy = filterForStaff(s, { permissions: everything, locationRefs: [], role: "manager" });
    expect(copy.products.map((x) => x.name)).toEqual(["Cable"]);
    expect(copy.sales.some((x) => x.businessId === b.id)).toBe(false);
    expect(copy.locations.some((l) => l.businessId === b.id)).toBe(false);
  });
  it("an employee given shops in two businesses sees only the business of the shop they are working at", () => {
    const { b, s } = setUp();
    const copy = filterForStaff(s, { permissions: everything, locationRefs: [erp.MAIN_LOCATION, shopOf(s, b.id).id], activeRef: erp.MAIN_LOCATION, role: "cashier" });
    expect(copy.products.map((x) => x.name)).toEqual(["Cable"]);
    expect(copy.locations.some((l) => l.businessId === b.id)).toBe(false);
  });
});

describe("changing a business's details", () => {
  it("updates its own record with the same rules, and never the first business through it", () => {
    const b = createBusiness(clinic, { name: "Clinic Front", type: "shop" });
    erp.updateBusiness(b.id, { ...clinic, name: "Afya Medical", businessType: typeOf("healthcare", 1) });
    expect(erp.load().businesses[0]).toMatchObject({ name: "Afya Medical", businessType: typeOf("healthcare", 1), industryFamilyId: "healthcare" });
    expect(() => erp.updateBusiness(b.id, { ...clinic, businessType: typeOf("trade") })).toThrow("That business type is not part of the chosen industry");
    expect(() => erp.updateBusiness(erp.MAIN_BUSINESS, clinic)).toThrow(/Business Profile/);
    expect(erp.load().audit.map((a) => a.action)).toContain("BUSINESS UPDATED");
  });
});
