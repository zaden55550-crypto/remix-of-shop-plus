// A new account on a device never sees the earlier business, which is kept aside and comes back for its owner (owner, 2026-11-25);
// and a Setup draft never holds more than the plan allows.
import { beforeEach, describe, expect, it } from "vitest";
import { restoreBusiness, savedBusinessCount, savedBusinessFor } from "@/lib/device-businesses";
import { fitDraftToPlan, readDraft, saveDraft, type SetupDraft } from "@/lib/business-setup";
import { store, type Account } from "@/lib/shopbook";

const acct = (id: string, name: string, email: string) => ({ shopName: name, email, phone: "0700000000", currency: "KES", country: "KEN", password: "x", plan: "trial", trialStart: Date.now(), businessId: id } as Account);

describe("several owners on one device", () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
  it("a new account starts empty and the earlier business comes back for its owner", () => {
    store.register(acct("biz-a", "Duka A", "a@x.co"));
    localStorage.setItem("shopbook.erp", JSON.stringify({ products: [{ id: "p1" }] }));
    localStorage.setItem("shopbook.setupDraft", JSON.stringify({ rows: [], users: [] }));
    localStorage.setItem("shopbook.language", "Swahili");
    store.register(acct("biz-b", "Duka B", "b@x.co"));
    expect(store.get()?.shopName).toBe("Duka B");
    expect(localStorage.getItem("shopbook.erp")).toBeNull();
    expect(localStorage.getItem("shopbook.setupDraft")).toBeNull();
    expect(localStorage.getItem("shopbook.language")).toBe("Swahili");
    expect(savedBusinessCount()).toBe(1);
    expect(savedBusinessFor("a@x.co")).toBe("biz-a");
    expect(savedBusinessFor(" duka a ")).toBe("biz-a");
    expect(restoreBusiness("biz-a")).toBe(true);
    expect(store.get()?.shopName).toBe("Duka A");
    expect(JSON.parse(localStorage.getItem("shopbook.erp")!).products).toHaveLength(1);
    expect(store.signedIn()).toBe(false);
    expect(savedBusinessFor("b@x.co")).toBe("biz-b");
  });
  it("saving the same business again keeps everything", () => {
    store.register(acct("biz-a", "Duka A", "a@x.co"));
    localStorage.setItem("shopbook.erp", "{}");
    store.register(acct("biz-a", "Duka A", "a@x.co"));
    expect(localStorage.getItem("shopbook.erp")).toBe("{}");
    expect(savedBusinessCount()).toBe(0);
  });
});

describe("Setup drafts", () => {
  beforeEach(() => localStorage.clear());
  const row = (key: string, extra: object = {}) => ({ key, type: "shop" as const, name: key, code: "", ...extra });
  it("belong to one business", () => {
    saveDraft({ owner: "biz-a", businessName: "A", businessType: "", otherType: "", extraBusinessTypes: [], rows: [], users: [] } as SetupDraft);
    expect(readDraft("biz-a")).not.toBeNull();
    expect(readDraft("biz-b")).toBeNull();
  });
  it("are cut to the plan's locations and counters", () => {
    const d = { businessName: "A", businessType: "", otherType: "", extraBusinessTypes: [], rows: [row("a", { counters: 15 }), row("b"), row("c"), row("d"), row("e")], users: [{ key: "u", name: "U", phone: "", email: "u@x.co", role: "shopkeeper", locations: ["a", "c"] }] } as SetupDraft;
    const basic = fitDraftToPlan(d, { locations: 1, counters: 1, countersPerShop: false });
    expect(basic.rows.map((r) => [r.key, r.counters])).toEqual([["a", 1]]);
    expect(basic.users[0]!.locations).toEqual(["a"]);
    const growth = fitDraftToPlan(d, { locations: 5, counters: 10, countersPerShop: false });
    expect(growth.rows).toHaveLength(5);
    expect(growth.rows[0]!.counters).toBe(6);
    const saved = fitDraftToPlan({ ...d, rows: [row("s1", { savedId: "L1" }), row("s2", { savedId: "L2" }), row("x")] }, { locations: 1, counters: 1, countersPerShop: false });
    expect(saved.rows.map((r) => r.key)).toEqual(["s1", "s2"]);
  });
});
