// Access levels per app and Add location's untyped rows (owner, 2026-11-24).
import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/people-access.functions", () => ({ peopleCall: vi.fn(async () => ({})) }));
import { ACCESS_KEYS, ROLE_DEFAULTS, applyAccess, effective, levelOf, setAll, setLevel, setRight } from "@/lib/access-levels";
import { peopleCall } from "@/lib/people-access.functions";
import { validate, type SetupDraft } from "@/lib/business-setup";
import { slotParts } from "@/components/shopbook/slots-full";

describe("access levels", () => {
  it("reads each role's starting level per app", () => {
    expect(levelOf(effective("admin"), "accounting")).toBe("full");
    expect(levelOf(effective("manager"), "sales")).toBe("manage");
    expect(levelOf(effective("manager"), "accounting")).toBe("none");
    expect(levelOf(effective("shopkeeper"), "pos")).toBe("use");
    expect(levelOf(effective("shopkeeper"), "inventory")).toBe("view");
    expect(effective("staff").size).toBe(0);
  });
  it("keeps only the differences from the role", () => {
    const a = setLevel("shopkeeper", undefined, "pos", "use");
    expect(a).toEqual({});
    const b = setLevel("staff", undefined, "sales", "use");
    expect(b).toEqual({ "module.sales.view": true, "module.sales.create": true });
    const c = setLevel("shopkeeper", undefined, "inventory", "none");
    expect(c).toEqual({ "module.inventory.view": false });
    expect(levelOf(effective("staff", setLevel("staff", b, "sales", "full")), "sales")).toBe("full");
  });
  it("switches sensitive rights and everything at once", () => {
    const r = setRight("manager", undefined, "products.view_buying_price", true);
    expect(r).toEqual({ "products.view_buying_price": true });
    expect(effective("staff", setAll("staff", true)).size).toBe(ACCESS_KEYS.length);
    expect(effective("admin", setAll("admin", false)).size).toBe(0);
    expect(setAll("admin", true)).toEqual({});
  });
  it("sends the person's own settings once their login exists", async () => {
    expect(await applyAccess("m1", { "module.sales.view": true, "sales.refund": false })).toBe(0);
    expect(peopleCall).toHaveBeenCalledWith({ data: { fn: "set_member_permission", args: { p_member: "m1", p_key: "module.sales.view", p_allowed: true } } });
    expect(peopleCall).toHaveBeenCalledTimes(2);
  });
  it("role defaults only use known keys", () => {
    for (const keys of Object.values(ROLE_DEFAULTS)) for (const k of keys) expect(ACCESS_KEYS).toContain(k);
  });
});

describe("user places per plan", () => {
  it("splits each plan into owner, managers and staff", () => {
    expect(slotParts("basic")).toMatchObject({ total: 2, managers: 0, staff: 1, top: false });
    expect(slotParts("growth")).toMatchObject({ total: 12, managers: 1, staff: 10, top: false });
    expect(slotParts("business")).toMatchObject({ total: 24, managers: 3, staff: 20, top: true });
  });
});

describe("Add location", () => {
  const draft = (untyped: boolean): SetupDraft => ({ businessName: "Biz", businessType: "", otherType: "", industryFamilyId: "trade", extraBusinessTypes: [], rows: [{ key: "a", type: "shop", name: "A", code: "", ...(untyped ? { untyped: true } : {}) }], users: [] } as unknown as SetupDraft);
  it("asks for a type until one is chosen", () => {
    expect(validate(draft(true), 10, 23, 3, [], []).some((p) => p.field === "type")).toBe(true);
    expect(validate(draft(false), 10, 23, 3, [], []).some((p) => p.field === "type")).toBe(false);
  });
  it("lets a Staff login be saved with chosen access", () => {
    const d = { ...draft(false), users: [{ key: "u", name: "Amina", phone: "", email: "a@b.co", role: "staff", locations: ["a"], access: { "module.pos.view": true } }] } as SetupDraft;
    expect(validate(d, 10, 23, 3, [], []).filter((p) => p.field === "users")).toEqual([]);
  });
});
