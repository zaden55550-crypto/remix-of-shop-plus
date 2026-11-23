import { beforeEach, describe, expect, it } from "vitest";
import { leaveSampleShop, recoverAbandonedSample, startSampleShop } from "@/lib/sample-shop";
import { store } from "@/lib/shopbook";

const owner = { shopName: "Mama Njeri Shop", email: "o@example.com", currency: "KES", password: "hash", plan: "trial" as const, role: "owner" };

describe("sample shop on a device that already has a business", () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
  it("sets the business aside, opens the sample, and puts the business back signed out", () => {
    localStorage.setItem("shopbook.account", JSON.stringify(owner));
    localStorage.setItem("shopbook.erp", JSON.stringify({ products: [{ id: "p1", name: "Sugar" }] }));
    localStorage.setItem("shopbook.session", "1");
    localStorage.setItem("sb-abc-auth-token", "token");
    startSampleShop();
    expect(store.get()?.demo).toBe(true);
    expect(JSON.parse(localStorage.getItem("shopbook.erp")!).products.some((p: { name: string }) => p.name === "Sugar")).toBe(false);
    expect(localStorage.getItem("sb-abc-auth-token")).toBeNull();
    leaveSampleShop();
    expect(store.get()?.shopName).toBe("Mama Njeri Shop");
    expect(JSON.parse(localStorage.getItem("shopbook.erp")!).products[0].name).toBe("Sugar");
    expect(localStorage.getItem("sb-abc-auth-token")).toBe("token");
    expect(store.signedIn()).toBe(false);
    expect(localStorage.getItem("zakrio.parkedBusiness")).toBeNull();
  });
  it("puts the business back when the browser was closed during the sample", () => {
    localStorage.setItem("shopbook.account", JSON.stringify(owner));
    startSampleShop();
    sessionStorage.clear(); // the tab-only sample session ends with the browser
    recoverAbandonedSample();
    expect(store.get()?.shopName).toBe("Mama Njeri Shop");
    expect(store.get()?.demo).toBeFalsy();
  });
  it("opens on an empty device and leaves it empty", () => {
    startSampleShop();
    expect(store.get()?.demo).toBe(true);
    leaveSampleShop();
    expect(store.get()).toBeNull();
  });
});
