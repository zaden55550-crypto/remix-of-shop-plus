import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyUiSize, getTextSize, getUiSize, setTextSize, setUiSize } from "@/lib/prefs";

describe("whole-interface size", () => {
  beforeEach(() => localStorage.clear());

  it("scales from 50% to 200% and clamps outside that range", () => {
    setTextSize("normal");
    const write = vi.spyOn(document.documentElement.style, "setProperty");
    const lastSet = (name: string) => write.mock.calls.filter(([key]) => key === name).at(-1)?.[1];
    for (const v of [0.5, 0.75, 1, 1.5, 2]) {
      setUiSize(v);
      expect(getUiSize()).toBe(v);
      expect(lastSet("zoom")).toBe(String(v));
      expect(lastSet("--ui-zoom")).toBe(String(v));
      applyUiSize();
      expect(lastSet("zoom")).toBe(String(v));
      expect(lastSet("--ui-zoom")).toBe(String(v));
    }
    setUiSize(3); expect(getUiSize()).toBe(2);
    setUiSize(0.1); expect(getUiSize()).toBe(0.5);
    write.mockRestore();
  });

  it("does not change account or business records", () => {
    const records = JSON.stringify({ sales: [{ id: "sale-1", total: 3500 }] });
    localStorage.setItem("shopbook.erp", records);
    setUiSize(2); setUiSize(0.5); setUiSize(1); setTextSize("extra-large"); setTextSize("normal");
    expect(localStorage.getItem("shopbook.erp")).toBe(records);
  });

  it("reads old named sizes and falls back safely", () => {
    localStorage.setItem("shopbook.uiSize", "Larger"); expect(getUiSize()).toBe(1.1);
    localStorage.setItem("shopbook.uiSize", "invalid"); expect(getUiSize()).toBe(1);
  });
});

describe("text size (Normal / Large / Extra Large)", () => {
  beforeEach(() => { localStorage.clear(); Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 }); });
  // jsdom does not keep the zoom property, so read the last value written to it.
  const zoom = () => { const calls = write.mock.calls.filter(([k]) => k === "zoom"); return Number(calls[calls.length - 1]?.[1]); };
  let write = vi.spyOn(document.documentElement.style, "setProperty");
  beforeEach(() => { write = vi.spyOn(document.documentElement.style, "setProperty"); return () => write.mockRestore(); });

  it("defaults to Large and persists the choice on the device", () => {
    expect(getTextSize()).toBe("large");
    setTextSize("extra-large");
    expect(localStorage.getItem("shopbook.textSize")).toBe("extra-large");
    expect(getTextSize()).toBe("extra-large");
    localStorage.setItem("shopbook.textSize", "huge"); expect(getTextSize()).toBe("large");
  });

  it("multiplies the interface size and marks the page for styling", () => {
    setUiSize(1);
    setTextSize("normal"); expect(zoom()).toBe(1);
    setTextSize("large"); expect(zoom()).toBe(1.08);
    setTextSize("extra-large"); expect(zoom()).toBe(1.18);
    expect(document.documentElement.dataset["textSize"]).toBe("extra-large");
    setUiSize(1.5); expect(zoom()).toBeCloseTo(1.77, 4);
  });

  it("grows less on phones so one-row layouts still fit", () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    setTextSize("large"); expect(zoom()).toBe(1.06);
    setTextSize("extra-large"); expect(zoom()).toBe(1.12);
  });

  it("never draws the Log In and Create Account pages below the default size on wide screens, and leaves other screens alone", () => {
    setTextSize("large"); setUiSize(0.6);
    expect(document.documentElement.style.getPropertyValue("--ui-zoom")).toBe("0.648");
    const page = document.createElement("main"); page.className = "auth-split-page"; document.body.appendChild(page);
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });
    applyUiSize();
    expect(document.documentElement.style.getPropertyValue("--ui-zoom")).toBe("1.08");
    setUiSize(1.5);
    expect(document.documentElement.style.getPropertyValue("--ui-zoom")).toBe("1.62");
    setUiSize(0.6);
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 440 });
    applyUiSize();
    expect(document.documentElement.style.getPropertyValue("--ui-zoom")).toBe(String(+(0.6 * 1.06).toFixed(4)));
    page.remove();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });
    applyUiSize();
    expect(document.documentElement.style.getPropertyValue("--ui-zoom")).toBe("0.648");
  });
});
