// Plans and location allowances: a shop and a warehouse each take one slot, and the engine refuses more than the plan allows.
import { beforeEach, describe, expect, it } from "vitest";
import * as erp from "@/lib/erp";
import { MAIN_LOCATION, listLocations, locationUsage, overPlanLocations, saveLocation, setLocationActive } from "@/lib/locations";
import { PLANS, canOpen, locationAllowance, planAllowanceLines, store, type PlanId } from "@/lib/shopbook";
import { translateText } from "@/lib/interface-translations";

const account = (plan: string, extra = {}) => localStorage.setItem("shopbook.account", JSON.stringify({ shopName: "Test Shop", email: "t@example.com", currency: "KES", password: "x", plan, trialStart: Date.now(), ...extra }));
const add = (type: "shop" | "warehouse", n: number) => saveLocation({ name: `${type} ${n}`, type });
beforeEach(() => { localStorage.clear(); });

describe("plans", () => {
  it("Plus is now Growth at the same prices, with its allowance", () => {
    expect(PLANS.map((p) => [p.id, p.name, p.monthlyUsd, p.yearlyUsd, p.locations])).toEqual([["basic", "Basic", 11, 118.8, 1], ["growth", "Growth", 22, 237.6, 5], ["business", "Business", 50, 540, 10]]);
  });
  it("each card shows two rows, worked out from the plan's own numbers and translated", () => {
    expect(PLANS.map(planAllowanceLines)).toEqual([
      ["1 Location · Up to 2 Users", "1 Owner + 1 Employee"],
      ["5 Locations · Up to 12 Users", "1 Owner + 1 Manager + 10 Staff"],
      ["10 Locations · Up to 24 Users", "1 Owner + 3 Managers + 20 Staff"],
    ]);
    expect(planAllowanceLines({ ...PLANS[1]!, locations: 6 })[0]).toBe("6 Locations · Up to 12 Users");
    for (const line of PLANS.flatMap(planAllowanceLines)) expect(translateText("French", line)).not.toBe(line);
  });

  it("a customer saved as Plus opens as Growth with nothing else changed", () => {
    account("plus", { shopName: "Old Shop" });
    const a = store.get()!;
    expect(a.plan).toBe("growth");
    expect(a.shopName).toBe("Old Shop");
    expect(canOpen(a, "growth")).toBe(true);
    expect(canOpen(a, "business")).toBe(false);
    expect(locationAllowance(a)).toBe(5);
  });
});

describe("location allowance", () => {
  it.each([["basic", 1], ["growth", 5], ["business", 10]] as [PlanId, number][])("%s allows %i active locations", (plan, max) => {
    account(plan);
    for (let i = 1; i < max; i++) add(i % 2 ? "warehouse" : "shop", i);
    expect(locationUsage(erp.load())).toMatchObject({ max, active: max, available: 0 });
    expect(() => add("shop", 99)).toThrow(/Upgrade your plan/);
    expect(listLocations(erp.load())).toHaveLength(max);
  });

  it("any mix works: all warehouses, or shops, stores and warehouses together", () => {
    account("growth");
    saveLocation({ id: MAIN_LOCATION, name: "Store One", type: "warehouse" });
    for (let i = 1; i <= 4; i++) add("warehouse", i);
    expect(locationUsage(erp.load())).toMatchObject({ shops: 0, warehouses: 5, available: 0 });
    localStorage.clear();
    account("business");
    for (let i = 1; i <= 2; i++) add("shop", i);
    for (let i = 1; i <= 2; i++) saveLocation({ name: `store ${i}`, type: "store" });
    for (let i = 1; i <= 5; i++) add("warehouse", i);
    expect(locationUsage(erp.load())).toMatchObject({ shops: 3, stores: 2, warehouses: 5, available: 0 });
  });

  it("Basic accepts one Shop and refuses Stores", () => {
    account("basic");
    expect(listLocations(erp.load()).find((l) => l.id === MAIN_LOCATION)?.type).toBe("shop");
    expect(() => saveLocation({ name: "Main Store", type: "store" })).toThrow(/Basic allows one Shop and no Warehouse/);
    expect(() => saveLocation({ name: "Main Warehouse", type: "warehouse" })).toThrow(/Basic allows one Shop and no Warehouse/);
    expect(() => add("shop", 1)).toThrow(/Upgrade your plan/);
  });

  it("archiving frees a slot and keeps the record; bringing it back needs a free slot", () => {
    account("growth");
    const a = add("shop", 1); add("shop", 2); add("shop", 3); add("shop", 4);
    setLocationActive(a.id, false);
    expect(locationUsage(erp.load())).toMatchObject({ active: 4, available: 1, archived: 1 });
    add("warehouse", 5);
    expect(() => setLocationActive(a.id, true)).toThrow(/Upgrade your plan/);
    expect(listLocations(erp.load())).toHaveLength(6);
  });

  it("a downgrade deletes nothing, warns, and blocks new ones until within the limit", () => {
    account("business");
    const made = [add("shop", 1), add("shop", 2), add("shop", 3), add("shop", 4), add("shop", 5), add("shop", 6)];
    account("growth");
    expect(locationUsage(erp.load())).toMatchObject({ max: 5, active: 7, over: 2 });
    expect(() => add("shop", 9)).toThrow(/Upgrade your plan/);
    setLocationActive(made[0]!.id, false); setLocationActive(made[1]!.id, false);
    expect(locationUsage(erp.load())).toMatchObject({ over: 0, available: 0, archived: 2 });
  });

  it("the last active location can't be archived, and names and codes stay unique", () => {
    account("growth");
    expect(() => setLocationActive(MAIN_LOCATION, false)).toThrow(/must stay active/);
    add("shop", 1);
    expect(() => saveLocation({ name: " SHOP 1 ", type: "warehouse" })).toThrow(/name already exists/);
    expect(() => saveLocation({ name: "Other", code: "main", type: "shop" })).toThrow(/code already exists/);
    expect(() => saveLocation({ name: "", type: "shop" })).toThrow(/Enter a location name/);
  });

  it("every change is audited, and staff can't manage locations", () => {
    account("growth");
    add("shop", 1);
    expect(erp.load().audit[0]?.action).toBe("LOCATION CREATED");
    account("growth", { role: "staff" });
    expect(() => add("shop", 2)).toThrow(/Only the owner/);
  });

  it("the trial has the Business allowance; no plan has one", () => {
    account("trial");
    expect(locationAllowance(store.get())).toBe(10);
    expect(locationAllowance(null)).toBe(1);
  });
});

describe("locations over the plan", () => {
  it("flags the newest, keeps the main location, and clears when archived", () => {
    account("business");
    const a = saveLocation({ name: "A", type: "shop" }), b = saveLocation({ name: "B", type: "warehouse" });
    expect(overPlanLocations(erp.load())).toEqual([]);
    account("basic");
    expect(overPlanLocations(erp.load()).map((l) => l.id)).toEqual([a, b].sort((x, y) => x.createdAt - y.createdAt || x.id.localeCompare(y.id)).map((l) => l.id));
    expect(() => saveLocation({ name: "C", type: "shop" })).toThrow(/plan allows/);
    setLocationActive(b.id, false);
    expect(overPlanLocations(erp.load()).map((l) => l.id)).toEqual([a.id]);
    setLocationActive(a.id, false);
    expect(overPlanLocations(erp.load())).toEqual([]);
    expect(listLocations(erp.load()).map((l) => l.id)).toEqual([MAIN_LOCATION, a.id, b.id].sort((x, y) => (x === MAIN_LOCATION ? -1 : y === MAIN_LOCATION ? 1 : 0)));
  });
});
