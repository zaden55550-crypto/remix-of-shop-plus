// Business / Shop Setup: plan limits, location numbers, the login allowance and the all-or-nothing activation.
import { beforeEach, describe, expect, it } from "vitest";
import * as erp from "@/lib/erp";
import { activateSetup, countTypes, loginSummary, readDraft, resize, rowsFromRecords, saveDraft, setupPlan, suggestCode, validate, type SetupDraft, type SetupRow } from "@/lib/business-setup";
import { listLocations, locationUsage, saveLocation } from "@/lib/locations";
import { store } from "@/lib/shopbook";
import { BUSINESS_TYPES as APPROVED_BUSINESS_TYPES, INDUSTRIES, validateIndustryCatalogue } from "@/lib/industry-config";

const account = (plan: string, extra = {}) => {
  localStorage.setItem("shopbook.account", JSON.stringify({ shopName: "Kifaru", email: "k@example.com", currency: "KES", password: "x", plan, trialStart: Date.now(), businessId: "biz-1", ...extra }));
  localStorage.setItem("shopbook.session", "1");
};
const row = (key: string, type: SetupRow["type"], name: string, code: string, extra: Partial<SetupRow> = {}): SetupRow => ({ key, type, name, code, ...extra });
const draft = (rows: SetupRow[], extra: Partial<SetupDraft> = {}): SetupDraft => ({ businessName: "Kifaru General Supplies", businessType: "Retail Shop", otherType: "", extraBusinessTypes: [], rows, users: [], ...extra });

beforeEach(() => localStorage.clear());

describe("approved industry catalogue", () => {
  it("supplies all approved industries and business types", () => {
    expect(INDUSTRIES).toHaveLength(8);
    expect(APPROVED_BUSINESS_TYPES).toHaveLength(111);
    expect(validateIndustryCatalogue()).toEqual([]);
  });
  it("rejects a catalogued type assigned to a different industry", () => {
    const problems = validate(draft([row("a", "shop", "Main", "SHOP-001")], { businessType: "Medical Clinic", industryFamilyId: "trade" }), 1, 1, 0, [], []);
    expect(problems.some((problem) => problem.field === "businessType" && problem.message.includes("selected industry"))).toBe(true);
  });
  it("persists the approved business label and family without replacing saved locations", () => {
    account("business", { businessType: "Retail Shop", industryFamilyId: "trade" });
    const existing = saveLocation({ name: "Main", type: "shop" });
    const existingIds = listLocations(erp.load()).map((location) => location.id);
    activateSetup(draft([row("a", "shop", existing.name, existing.code, { savedId: existing.id })], { businessType: "Medical Clinic", industryFamilyId: "healthcare" }));
    expect(store.get()).toMatchObject({ businessTypes: ["Medical Clinic"], industryFamilyId: "healthcare" });
    expect(listLocations(erp.load()).map((location) => location.id)).toEqual(existingIds);
  });
  it("preserves an older business label until the owner selects a catalogue type", () => {
    account("business", { businessType: "Hardware" });
    activateSetup(draft([row("a", "shop", "Main", "SHOP-001")], { businessType: "Hardware", industryFamilyId: "trade" }));
    expect(store.get()).toMatchObject({ businessTypes: ["Hardware"] });
  });
});

describe("which plan the page is for", () => {
  it("uses the paid plan, or the plan picked for the trial", () => {
    expect(setupPlan({ plan: "basic" }).locations).toBe(1);
    expect(setupPlan({ plan: "trial", trialChoice: "growth" }).locations).toBe(5);
    expect(setupPlan({ plan: "trial" }).id).toBe("business");
  });
});

describe("location numbers", () => {
  it("suggests the next free number for each type", () => {
    expect(suggestCode("shop", [])).toBe("SHOP-001");
    expect(suggestCode("shop", ["SHOP-001", "shop-002"])).toBe("SHOP-003");
    expect(suggestCode("store", ["SHOP-001"])).toBe("STORE-001");
    expect(suggestCode("warehouse", [])).toBe("WH-001");
  });
  it("Settings suggests the same format", () => {
    account("business");
    expect(saveLocation({ name: "Riverside", type: "shop" }).code).toBe("SHOP-001");
    expect(saveLocation({ name: "Central", type: "warehouse" }).code).toBe("WH-001");
  });
});

describe("choosing how many locations", () => {
  it("adds shops with fresh numbers and removes unsaved rows freely", () => {
    const grown = resize([row("a", "shop", "Main", "SHOP-001")], 3, []).rows;
    expect(grown.map((r) => r.code)).toEqual(["SHOP-001", "SHOP-002", "SHOP-003"]);
    const shrunk = resize(grown, 1, []);
    expect(shrunk.rows).toHaveLength(1);
    expect(shrunk.needsConfirm).toEqual([]);
  });
  it("never drops a saved location silently: it asks first", () => {
    const rows = [row("a", "shop", "Main", "SHOP-001", { savedId: "loc-main" }), row("b", "warehouse", "Central", "WH-001", { savedId: "w1" })];
    const out = resize(rows, 1, []);
    expect(out.needsConfirm.map((r) => r.key)).toEqual(["b"]);
    expect(out.rows).toHaveLength(2);
  });
});

describe("one login pool per plan (2026-11-20)", () => {
  const ten = (type: SetupRow["type"]) => Array.from({ length: 10 }, (_, i) => row(`${type}${i}`, type, `${type} ${i}`, `X-${i}`));
  it("is 2, 12 or 24 whatever the shops and warehouses", () => {
    expect(loginSummary("basic", [], [], [row("b", "shop", "Basic", "B")]).total).toBe(2);
    expect(loginSummary("growth", [], [], ten("shop").slice(0, 5)).total).toBe(12);
    expect(loginSummary("growth", [], [], ten("warehouse").slice(0, 5)).total).toBe(12);
    expect(loginSummary("growth", [], [], [row("a", "shop", "A", "A")]).total).toBe(12);
    const managers = [1, 2, 3].map((i) => ({ key: `m${i}`, name: `M${i}`, phone: "", email: "", role: "manager", locations: [] }));
    expect(loginSummary("business", managers, [], ten("store")).total).toBe(24);
    expect(loginSummary("business", managers, [], ten("shop")).total).toBe(24);
    expect(countTypes(ten("warehouse"))).toEqual({ shops: 0, stores: 0, warehouses: 10 });
  });
  it("one owner sees the same Business total with 1, 2, 5 or 10 real sites", () => {
    account("business");
    let sites = 1;
    for (const n of [1, 2, 5, 10]) {
      while (sites < n) saveLocation({ name: `Site ${++sites}`, type: sites % 2 ? "shop" : "warehouse" });
      expect(locationUsage(erp.load()).active).toBe(n);
      const s = loginSummary("business", [], erp.load().employees, rowsFromRecords(erp.load()));
      const rows = rowsFromRecords(erp.load());
      const counts = countTypes(rows);
      expect(counts.shops + counts.stores + counts.warehouses).toBe(n);
      expect(s.total).toBe(24);
    }
  });
  it("counts the owner and each person once, however many locations they have", () => {
    const s = loginSummary("growth", [{ key: "u", name: "Amina", phone: "0711000000", email: "", role: "manager", locations: ["a", "b", "c"] }], [{ memberId: "m", accessRole: "shopkeeper", active: true, locationIds: ["a"] }, { accessRole: "shopkeeper", active: false }, { active: true }], [row("a", "shop", "Shop", "A")]);
    expect([s.used, s.usedManagers, s.total]).toEqual([3, 1, 12]);
  });
});

describe("checks before Review & Activate", () => {
  it("needs a name and unique location numbers and names; a Trade type is optional (General Trade)", () => {
    const problems = validate(draft([row("a", "shop", "Main", "SHOP-001"), row("b", "shop", "main", "shop-001")], { businessName: " ", businessType: "" }), 5, 11, 11, [], []);
    expect(problems.map((p) => p.field)).toEqual(expect.arrayContaining(["businessName", "name", "code"]));
    expect(problems.some((p) => p.field === "businessType")).toBe(false);
  });
  it("refuses more locations than the plan, and managers on Basic", () => {
    expect(validate(draft([row("a", "shop", "A", "SHOP-001"), row("b", "shop", "B", "SHOP-002")]), 1, 1, 0, [], []).some((p) => p.message.includes("allows 1 location"))).toBe(true);
    const withManager = draft([row("a", "shop", "A", "SHOP-001")], { users: [{ key: "u", name: "Amina", phone: "0711000000", email: "", role: "manager", locations: ["a"] }] });
    expect(validate(withManager, 1, 1, 0, [], []).some((p) => p.message === "This plan has no manager logins")).toBe(true);
  });
  it("refuses more people than the plan's remaining login accounts", () => {
    const person = (k: string) => ({ key: k, name: k, phone: "0711000000", email: "", role: "shopkeeper", locations: ["a"] });
    const two = draft([row("a", "shop", "A", "SHOP-001")], { users: [person("x"), person("y")] });
    expect(validate(two, 1, 1, 0, [], []).some((p) => p.message === "Your plan has room for 1 more login account")).toBe(true);
    // Growth: all 10 staff may work at one shop; an 11th staff member is refused even with the manager place empty.
    const ten = draft([row("a", "shop", "A", "SHOP-001")], { users: Array.from({ length: 10 }, (_, i) => person(`p${i}`)) });
    expect(validate(ten, 5, 11, 11, [], [], { planId: "growth", existing: [] }).filter((p) => p.field === "users")).toEqual([]);
    const eleven = draft([row("a", "shop", "A", "SHOP-001")], { users: Array.from({ length: 11 }, (_, i) => person(`p${i}`)) });
    expect(validate(eleven, 5, 11, 11, [], [], { planId: "growth", existing: [] }).some((p) => p.message.includes("10 staff"))).toBe(true);
  });
  it("a custom type is needed when Other is chosen", () => {
    expect(validate(draft([row("a", "shop", "A", "SHOP-001")], { businessType: "Other" }), 1, 1, 0, [], []).some((p) => p.field === "businessType")).toBe(true);
  });
  it("allows one extra business type in the same industry", () => {
    const d = draft([row("a", "shop", "A", "SHOP-001")], { businessType: "Retail Shop", extraBusinessTypes: ["Electronics Shop"] });
    expect(validate(d, 1, 1, 0, [], [])).toEqual([]);
  });
  it("refuses an extra type from a different industry", () => {
    const d = draft([row("a", "shop", "A", "SHOP-001")], { businessType: "Retail Shop", extraBusinessTypes: ["Medical Clinic"] });
    expect(validate(d, 1, 1, 0, [], []).some((p) => p.field === "businessType" && p.message.includes("not in the selected industry"))).toBe(true);
  });
  it("allows any number of extra business types in the same industry (owner's request, 2026-11-20)", () => {
    const d = draft([row("a", "shop", "A", "SHOP-001")], { businessType: "Retail Shop", extraBusinessTypes: ["Electronics Shop", "Grocery Store", "Butchery"] });
    expect(validate(d, 1, 1, 0, [], []).filter((p) => p.field === "businessType")).toEqual([]);
  });
});

describe("Review & Activate", () => {
  it("saves the business, every location and each person at once, and clears the draft", () => {
    account("trial", { trialChoice: "growth", setupPending: true });
    const d = draft([
      row("a", "shop", "Main Shop", "SHOP-001", { savedId: erp.MAIN_LOCATION }),
      row("b", "store", "Town Store", "STORE-001"),
      row("c", "warehouse", "Central Warehouse", "WH-001"),
    ], { users: [{ key: "u", name: "Juma", phone: "0722000000", email: "", role: "warehouse_staff", locations: ["c"] }] });
    saveDraft(d);
    const ids = activateSetup(d);
    const s = erp.load();
    expect(listLocations(s).map((l) => [l.code, l.name, l.type])).toEqual([["SHOP-001", "Main Shop", "shop"], ["STORE-001", "Town Store", "store"], ["WH-001", "Central Warehouse", "warehouse"]]);
    expect(s.employees[0]).toMatchObject({ name: "Juma", accessRole: "warehouse_staff", locationIds: [ids["c"]] });
    expect(store.get()).toMatchObject({ shopName: "Kifaru General Supplies", businessTypes: ["Retail Shop"], industryFamilyId: "trade" });
    expect(store.get()?.setupPending).toBeUndefined();
    expect(readDraft()).toBeNull();
  });
  it("saves nothing when any part is refused", () => {
    account("basic");
    const d = draft([row("a", "shop", "Main", "SHOP-001", { savedId: erp.MAIN_LOCATION }), row("b", "shop", "Second", "SHOP-002")]);
    expect(() => activateSetup(d)).toThrow(/allows 1 location/);
    expect(erp.load().locations).toEqual([]);
    expect(store.get()?.shopName).toBe("Kifaru");
  });
  it("connects shops to a warehouse without using another site, and keeps the photos", () => {
    account("growth");
    const photo = "data:image/png;base64,AAAA";
    const ids = activateSetup(draft([
      row("a", "shop", "Shop 1", "SHOP-001", { savedId: erp.MAIN_LOCATION, connected: ["w"] }),
      row("b", "shop", "Shop 2", "SHOP-002", { connected: ["w"], photos: [photo] }),
      row("w", "warehouse", "Main depot", "WH-001"),
    ]));
    const all = listLocations(erp.load());
    expect(all.filter((l) => l.active !== false)).toHaveLength(3);
    expect(all.find((l) => l.id === ids["a"])?.connected).toEqual([ids["w"]]);
    expect(all.find((l) => l.id === ids["b"])).toMatchObject({ connected: [ids["w"]], photos: [photo] });
  });
  it("refuses people past the plan's login total, saving nothing", () => {
    account("basic");
    const person = (k: string) => ({ key: k, name: k, phone: "0711000000", email: "", role: "shopkeeper", locations: ["a"] });
    expect(() => activateSetup(draft([row("a", "shop", "Main", "SHOP-001", { savedId: erp.MAIN_LOCATION })], { users: [person("x"), person("y")] }))).toThrow(/enough logins|login accounts/);
    expect(erp.load().employees).toEqual([]);
  });
  it("the number is optional: a blank one gets the next free number, skipping numbers typed further down", () => {
    account("business");
    const blank = validate(draft([row("a", "shop", "A", ""), row("b", "shop", "B", "")]), 10, 23, 23, [], []);
    expect(blank.filter((p) => p.field === "code")).toEqual([]);
    const ids = activateSetup(draft([row("a", "shop", "Main", "", { savedId: erp.MAIN_LOCATION }), row("b", "shop", "Second", ""), row("c", "shop", "Third", "SHOP-002"), row("w", "warehouse", "Depot", "")]));
    const code = (k: string) => listLocations(erp.load()).find((l) => l.id === ids[k])?.code;
    expect([code("a"), code("b"), code("c"), code("w")]).toEqual(["SHOP-001", "SHOP-003", "SHOP-002", "WH-001"]);
  });
  it("saves the primary and extra business types together", () => {
    account("trial", { trialChoice: "growth", setupPending: true });
    const d = draft([row("a", "shop", "Main Shop", "SHOP-001", { savedId: erp.MAIN_LOCATION })], { businessType: "Retail Shop", extraBusinessTypes: ["Electronics Shop"] });
    activateSetup(d);
    expect(store.get()).toMatchObject({ businessTypes: ["Retail Shop", "Electronics Shop"] });
    expect(store.get()?.businessType).toBeUndefined();
  });
  it("keeps a legacy single business type as the first when activated", () => {
    account("business", { businessType: "Hardware" });
    activateSetup(draft([row("a", "shop", "Main", "SHOP-001", { savedId: erp.MAIN_LOCATION })], { businessType: "Hardware", industryFamilyId: "trade" }));
    expect(store.get()).toMatchObject({ businessTypes: ["Hardware"] });
  });
  it("keeps each entry's own logo, and never wipes a saved address, phone or manager", () => {
    account("business");
    const old = saveLocation({ name: "Town", type: "shop", address: "Moi Avenue", phone: "0700111222" });
    const logo = "data:image/png;base64,BBBB";
    const rows = rowsFromRecords(erp.load()).map((r) => (r.key === old.id ? { ...r, logo } : r.savedId === erp.MAIN_LOCATION ? { ...r, name: "Main" } : r));
    activateSetup(draft(rows));
    expect(listLocations(erp.load()).find((l) => l.id === erp.MAIN_LOCATION)?.code).toBe("SHOP-002");
    expect(listLocations(erp.load()).find((l) => l.id === old.id)).toMatchObject({ logo, address: "Moi Avenue", phone: "0700111222" });
  });
  it("archives a removed location instead of deleting it", () => {
    account("business");
    saveLocation({ name: "Old Depot", type: "warehouse" });
    const rows = rowsFromRecords(erp.load()).map((r) => (r.name === "Old Depot" ? { ...r, archive: true } : { ...r, name: "Main", code: "SHOP-001" }));
    activateSetup(draft(rows));
    const depot = listLocations(erp.load()).find((l) => l.name === "Old Depot");
    expect(depot?.active).toBe(false);
  });
});
