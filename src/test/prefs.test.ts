import { beforeEach, describe, expect, it } from "vitest";
import { applyUiSize, getUiSize, setUiSize, UI_SIZES, type UiSize } from "@/lib/prefs";

describe("whole-interface size", () => {
  beforeEach(() => localStorage.clear());

  it("persists each supported size and scales the interface uniformly", () => {
    for (const size of Object.keys(UI_SIZES) as UiSize[]) {
      setUiSize(size);
      expect(getUiSize()).toBe(size);
      expect(document.documentElement.style.getPropertyValue("zoom")).toBe(String(UI_SIZES[size]));
      document.documentElement.style.removeProperty("zoom");
      applyUiSize();
      expect(document.documentElement.style.getPropertyValue("zoom")).toBe(String(UI_SIZES[size]));
    }
  });

  it("does not change account or business records", () => {
    const account = JSON.stringify({ shopName: "Existing shop", currency: "KSh", plan: "business" });
    const records = JSON.stringify({ sales: [{ id: "sale-1", total: 3500 }], products: [{ id: "product-1", qty: 8 }] });
    localStorage.setItem("shopbook.account", account);
    localStorage.setItem("shopbook.erp", records);
    setUiSize("Larger");
    setUiSize("Smaller");
    setUiSize("Default");
    expect(localStorage.getItem("shopbook.account")).toBe(account);
    expect(localStorage.getItem("shopbook.erp")).toBe(records);
  });

  it("uses the safe default for unknown stored values", () => {
    localStorage.setItem("shopbook.uiSize", "invalid");
    expect(getUiSize()).toBe("Default");
  });
});